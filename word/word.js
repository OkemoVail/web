// ─── Constants & state ─────────────────────────────────────────
        const BACKEND_URL = 'https://api.okemovail.com';
        const DOC_KEY = 'okemo_word_docs_v1';
        const LAST_KEY = 'okemo_word_last';

        let currentModel = 'Octan-1.2B';
        let isGenerating = false;
        let aiPanelOpen = false;
        let aiPanelTrigger = null;
        let savedRange = null;
        let autoSaveTimer = null;
        let responseMap = {};   // msgId → full text
        let msgCounter = 0;

        // ─── Boot ──────────────────────────────────────────────────────
        document.addEventListener('DOMContentLoaded', () => { try {
            // Init editor reference first — other functions depend on it
            editor = document.getElementById('editor');

            // Check for temp local datastorage transfer
            const tempTransfer = sessionStorage.getItem('okemo_word_temp_transfer');
            if (tempTransfer) {
                document.getElementById('doc-title').value = 'AI Generated Document';
                editor.innerHTML = tempTransfer;
                sessionStorage.removeItem('okemo_word_temp_transfer');
                saveDoc(true);
            } else {
                loadDoc();
            }

            updateStats();
            setAIPanel(false);

            // Close an open Oaky panel when crossing the mobile/desktop breakpoint
            let mobileLayout = window.matchMedia('(max-width: 768px)').matches;
            window.addEventListener('resize', () => {
                const nextMobileLayout = window.matchMedia('(max-width: 768px)').matches;
                if (nextMobileLayout !== mobileLayout) {
                    mobileLayout = nextMobileLayout;
                    setAIPanel(false);
                }
            });

            // Global keyboard shortcuts
            document.addEventListener('keydown', e => {
                const mod = e.ctrlKey || e.metaKey;
                if (mod && e.key === 's') { e.preventDefault(); saveDoc(); }
                if (mod && e.key === 'p') { e.preventDefault(); printDoc(); }
                if (e.key === 'Escape') {
                    const menu = document.getElementById('document-menu');
                    if (menu.getAttribute('aria-hidden') === 'false') {
                        closeDocumentMenu();
                        document.getElementById('document-menu-btn').focus();
                    } else if (aiPanelOpen) {
                        const trigger = aiPanelTrigger || document.getElementById('ai-toggle-btn');
                        setAIPanel(false);
                        trigger.focus();
                    }
                }
            });

            // Editor events
            editor.addEventListener('keyup', () => { updateStats(); syncToolbar(); });
            editor.addEventListener('mouseup', () => { syncToolbar(); captureRange(); });
            editor.addEventListener('input', onEdit);
            editor.addEventListener('click', () => { syncToolbar(); captureRange(); });
            editor.addEventListener('focus', captureRange);

            // Always keep savedRange current
            document.addEventListener('selectionchange', () => {
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0) {
                    const range = sel.getRangeAt(0);
                    if (editor && editor.contains(range.commonAncestorContainer)) {
                        savedRange = range.cloneRange();
                        syncToolbar();
                    }
                }
            });

            // Prevent toolbar buttons from stealing focus/selection from editor
            document.querySelector('.ow-toolbar').addEventListener('mousedown', e => {
                if (e.target.closest('button')) e.preventDefault();
            });
            // WebKit can cancel synthesized clicks after Liquid Glass pointer
            // capture. Convert a stationary touch into one intentional click;
            // drags still scroll normally and never activate a control.
            let touchControl = null;
            let touchOrigin = null;
            document.addEventListener('touchstart', e => {
                const button = e.target.closest('button');
                const touch = e.touches[0];
                touchControl = button || null;
                touchOrigin = button && touch ? { x: touch.clientX, y: touch.clientY } : null;
            }, { passive: true, capture: true });
            document.addEventListener('touchmove', e => {
                if (!touchControl || !touchOrigin || !e.touches[0]) return;
                const touch = e.touches[0];
                if (Math.hypot(touch.clientX - touchOrigin.x, touch.clientY - touchOrigin.y) > 8) touchControl = null;
            }, { passive: true, capture: true });
            document.addEventListener('touchend', e => {
                const button = e.target.closest('button');
                if (!button || button !== touchControl) { touchControl = null; return; }
                e.preventDefault();
                touchControl = null;
                button.click();
            }, { passive: false, capture: true });

            // Close the document menu when focus moves back to the workspace.
            document.addEventListener('click', e => {
                if (!e.target.closest('#document-menu, #document-menu-btn')) closeDocumentMenu();
            });

            // Listen for live updates from parent (e.g., Canvas mode in AI chat)
            window.addEventListener('message', (event) => {
                if (event.data && event.data.type === 'live_update') {
                    document.getElementById('editor').innerHTML = event.data.content;
                    if (event.data.title) document.getElementById('doc-title').value = event.data.title;
                    updateStats();
                    saveDoc(true);
                }
            });
        } catch(e) { console.error('Okemo Word failed to initialize', e); } });

        // ─── AI panel toggle ───────────────────────────────────────────
        function setAIPanel(open, trigger = null) {
            aiPanelOpen = open;
            if (open && trigger) aiPanelTrigger = trigger;
            const panel = document.getElementById('ai-panel');
            const toggle = document.getElementById('ai-toggle-btn');
            panel.classList.toggle('collapsed', !open);
            panel.setAttribute('aria-hidden', String(!open));
            panel.inert = !open;
            toggle.setAttribute('aria-expanded', String(open));
            toggle.classList.toggle('skuo-accent', open);
        }

        function toggleAIPanel(event) {
            setAIPanel(!aiPanelOpen, event?.currentTarget || null);
        }

        // ─── Formatting ────────────────────────────────────────────────
        let editor;

        function restoreSelection() {
            editor.focus();
            if (!savedRange) return;
            try {
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(savedRange);
            } catch (_) { }
        }

        function fmt(cmd, val) {
            restoreSelection();
            document.execCommand(cmd, false, val ?? null);
            captureRange();
            syncToolbar();
        }

        function formatBlock(tag) {
            restoreSelection();
            document.execCommand('formatBlock', false, tag);
            captureRange();
            syncToolbar();
        }

        function insertLink() {
            const url = prompt('Enter URL (include https://):', 'https://');
            if (url) { editor.focus(); document.execCommand('createLink', false, url); }
        }

        function insertHR() {
            editor.focus();
            document.execCommand('insertHTML', false,
                '<hr style="border:none;border-top:1px solid var(--border-strong);margin:1.2em 0;"><p><br></p>');
        }

        function insertTable() {
            editor.focus();
            const rows = parseInt(prompt('Rows:', '3') || '3');
            const cols = parseInt(prompt('Columns:', '3') || '3');
            if (!rows || !cols) return;
            let html = '<table style="border-collapse:collapse;width:100%;margin:1em 0;">';
            for (let r = 0; r < rows; r++) {
                html += '<tr>';
                for (let c = 0; c < cols; c++) {
                    const tag = r === 0 ? 'th' : 'td';
                    html += `<${tag} style="border:1px solid var(--border-strong);padding:6px 10px;text-align:left;${r === 0 ? 'font-weight:600;background:var(--border);' : ''}">${r === 0 ? 'Header' : 'Cell'}</${tag}>`;
                }
                html += '</tr>';
            }
            html += '</table><p><br></p>';
            document.execCommand('insertHTML', false, html);
        }

        // ─── Toolbar sync ──────────────────────────────────────────────
        const TB_CMDS = {
            'tb-bold': 'bold',
            'tb-italic': 'italic',
            'tb-underline': 'underline',
            'tb-strike': 'strikeThrough',
            'tb-al': 'justifyLeft',
            'tb-ac': 'justifyCenter',
            'tb-ar': 'justifyRight',
            'tb-aj': 'justifyFull',
            'tb-ul': 'insertUnorderedList',
            'tb-ol': 'insertOrderedList',
        };

        function syncToolbar() {
            for (const [id, cmd] of Object.entries(TB_CMDS)) {
                const el = document.getElementById(id);
                if (el) {
                    const active = document.queryCommandState(cmd);
                    el.classList.toggle('skuo-accent', active);
                    el.setAttribute('aria-pressed', String(active));
                }
            }
            const blk = document.queryCommandValue('formatBlock').toLowerCase().replace(/[<>]/g, '');
            const sel = document.getElementById('fmt-select');
            const valid = ['p', 'h1', 'h2', 'h3', 'blockquote', 'pre'];
            if (sel && valid.includes(blk)) sel.value = blk;
        }

        // Editor events — wired up in DOMContentLoaded after editor is assigned

        function captureRange() {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                if (editor && editor.contains(range.commonAncestorContainer)) savedRange = range.cloneRange();
            }
        }

        function getSelectedText() {
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed) return '';
            const range = sel.getRangeAt(0);
            if (!editor.contains(range.commonAncestorContainer)) return '';
            return sel.toString().trim();
        }

        // ─── Stats ─────────────────────────────────────────────────────
        function updateStats() {
            const text = editor.textContent || '';
            const words = text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
            const chars = text.length;
            const mins = Math.ceil(words / 200);
            const read = mins < 1 ? '< 1 min read' : `${mins} min read`;

            document.getElementById('st-words').textContent = `${words.toLocaleString()} word${words !== 1 ? 's' : ''}`;
            document.getElementById('st-chars').textContent = `${chars.toLocaleString()} char${chars !== 1 ? 's' : ''}`;
            document.getElementById('st-read').textContent = read;
            document.getElementById('hdr-word-count').textContent = `${words.toLocaleString()} words`;
        }

        // ─── Document persistence ──────────────────────────────────────
        function onEdit() {
            updateStats();
            markUnsaved();
            clearTimeout(autoSaveTimer);
            autoSaveTimer = setTimeout(() => saveDoc(true), 2500);
        }

        function markUnsaved() {
            const el = document.getElementById('st-save');
            el.textContent = 'Unsaved changes';
            el.style.color = 'var(--accent)';
        }

        function markSaved() {
            const el = document.getElementById('st-save');
            const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            el.textContent = `Saved ${now}`;
            el.style.color = 'var(--text-tertiary)';
        }

        function saveDoc(silent = false) {
            const title = document.getElementById('doc-title').value.trim() || 'Untitled Document';
            const content = editor.innerHTML;
            let store = {};
            try { store = JSON.parse(localStorage.getItem(DOC_KEY) || '{}'); } catch (_) {}
            store[title] = { title, content, savedAt: Date.now() };
            localStorage.setItem(DOC_KEY, JSON.stringify(store));
            localStorage.setItem(LAST_KEY, title);
            markSaved();
            if (!silent) showToast('Document saved');
        }

        function loadDoc() {
            const last = localStorage.getItem(LAST_KEY);
            if (!last) return;
            let store = {};
            try { store = JSON.parse(localStorage.getItem(DOC_KEY) || '{}'); } catch (_) {}
            const doc = store[last];
            if (doc) {
                document.getElementById('doc-title').value = doc.title;
                editor.innerHTML = doc.content;
                updateStats();
                markSaved();
            }
        }

        function newDoc() {
            if (editor.innerHTML.trim() && !confirm('Start a new document? Unsaved changes will be lost.')) return;
            editor.innerHTML = '';
            document.getElementById('doc-title').value = 'Untitled Document';
            localStorage.removeItem(LAST_KEY);
            updateStats();
            const el = document.getElementById('st-save');
            el.textContent = 'Not saved';
            el.style.color = 'var(--text-tertiary)';
        }

        // ─── Export ────────────────────────────────────────────────────
        function toggleDocumentMenu(event) {
            event.stopPropagation();
            const menu = document.getElementById('document-menu');
            const open = menu.getAttribute('aria-hidden') === 'true';
            menu.setAttribute('aria-hidden', String(!open));
            document.getElementById('document-menu-btn').setAttribute('aria-expanded', String(open));
            if (open) menu.querySelector('[role="menuitem"]').focus();
        }

        function closeDocumentMenu() {
            document.getElementById('document-menu').setAttribute('aria-hidden', 'true');
            document.getElementById('document-menu-btn').setAttribute('aria-expanded', 'false');
        }

        function exportHTML() {
            closeDocumentMenu();
            const title = document.getElementById('doc-title').value || 'document';
            const content = editor.innerHTML;
            const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>${title}</title>
<style>
  body{font-family:'Segoe UI',sans-serif;max-width:800px;margin:60px auto;padding:0 28px;line-height:1.8;color:#141413;font-size:16px}
  h1{font-size:2em}h2{font-size:1.5em}h3{font-size:1.2em}
  blockquote{border-left:3px solid #c96478;padding-left:1em;color:#5e5d59;font-style:italic;margin:1em 0}
  a{color:#c96478}hr{border:none;border-top:1px solid #e8e6dc;margin:1.5em 0}
  table{border-collapse:collapse;width:100%}td,th{border:1px solid #e8e6dc;padding:6px 10px}th{background:#f5f4ed}
  code{font-family:monospace;background:#f0eee6;padding:.1em .3em;border-radius:3px}
</style></head><body>${content}</body></html>`;
            dlFile(title + '.html', html, 'text/html');
        }

        function exportText() {
            closeDocumentMenu();
            const title = document.getElementById('doc-title').value || 'document';
            dlFile(title + '.txt', editor.innerText, 'text/plain');
        }

        function copyAsHTML() {
            closeDocumentMenu();
            navigator.clipboard.writeText(editor.innerHTML)
                .then(() => showToast('HTML copied to clipboard'))
                .catch(() => showToast('Could not access clipboard'));
        }

        function copyAsText() {
            closeDocumentMenu();
            navigator.clipboard.writeText(editor.innerText)
                .then(() => showToast('Text copied to clipboard'))
                .catch(() => showToast('Could not access clipboard'));
        }

        function dlFile(name, content, type) {
            const a = Object.assign(document.createElement('a'), {
                href: URL.createObjectURL(new Blob([content], { type })),
                download: name,
            });
            a.click(); URL.revokeObjectURL(a.href);
        }

        function printDoc() {
            closeDocumentMenu();
            window.print();
        }

        // ─── Toast ─────────────────────────────────────────────────────
        let toastTimer = null;
        function showToast(msg) {
            const t = document.getElementById('ow-toast');
            t.textContent = msg;
            t.style.opacity = '1';
            clearTimeout(toastTimer);
            toastTimer = setTimeout(() => { t.style.opacity = '0'; }, 2200);
        }

        // ─── AI — model ────────────────────────────────────────────────
        // Model hardcoded to Octan

        // ─── AI — quick prompts ────────────────────────────────────────
        const QUICK = {
            improve: (s, d) => s ? `Improve this text (preserve meaning):\n\n${s}` : `Improve the writing quality of my document:\n\n${d}`,
            continue: (s, d) => `Continue writing naturally from where this ends:\n\n${d.slice(-1000)}`,
            summarize: (s, d) => `Write a concise summary of this ${s ? 'selected text' : 'document'}:\n\n${s || d}`,
            grammar: (s, d) => `Fix all grammar, spelling, and punctuation errors:\n\n${s || d}`,
            shorter: (s, d) => `Make this shorter while keeping key information:\n\n${s || d}`,
            expand: (s, d) => `Expand this with more detail, examples, and depth:\n\n${s || d}`,
            suggest: (s, d) => `Suggest edits or improvements for the following text:\n\n${s || d}`,
            professional: (s, d) => `Rewrite this in a clear, professional, formal tone:\n\n${s || d}`,
            casual: (s, d) => `Rewrite this in a warm, friendly, conversational tone:\n\n${s || d}`,
        };

        function quickPrompt(type) {
            captureRange();
            const sel = getSelectedText();
            const doc = (editor.innerText || '').substring(0, 4000);
            if (!sel && !doc.trim()) { showToast('Write something first, or select text'); return; }
            const fn = QUICK[type];
            if (!fn) return;
            sendAIMessage(fn(sel, doc));
        }

        // ─── AI — input helpers ────────────────────────────────────────
        function handleAIKey(e) {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendAI(); }
        }

        function handleSendAI() {
            const input = document.getElementById('ai-input');
            const msg = input.value.trim();
            if (!msg || isGenerating) return;
            input.value = '';
            autoResizeTA(input);
            captureRange();
            sendAIMessage(msg);
        }

        function autoResizeTA(el) {
            el.style.height = 'auto';
            el.style.height = Math.min(el.scrollHeight, 100) + 'px';
            const qa = document.querySelector('.ai-quick-actions');
            if (qa) {
                qa.style.display = el.value.trim().length > 0 ? 'none' : 'flex';
            }
        }

        // ─── AI — streaming ────────────────────────────────────────────
        async function sendAIMessage(userMessage) {
            if (isGenerating) return;
            isGenerating = true;

            const msgsEl = document.getElementById('ai-messages');
            const welcome = document.getElementById('ai-welcome');
            if (welcome) welcome.remove();

            // User bubble
            const userDiv = document.createElement('div');
            userDiv.className = 'msg-user';
            userDiv.innerHTML = `<div class="msg-user-bubble">${escHtml(userMessage)}</div>`;
            msgsEl.appendChild(userDiv);
            msgsEl.scrollTop = msgsEl.scrollHeight;

            // AI bubble (thinking)
            const id = 'ai-' + (++msgCounter);
            const aiDiv = document.createElement('div');
            aiDiv.className = 'msg-ai';
            aiDiv.id = id;
            aiDiv.innerHTML = `<div class="msg-ai-bubble" id="${id}-txt">
        <div class="thinking-dots"><span></span><span></span><span></span></div>
    </div>`;
            msgsEl.appendChild(aiDiv);
            msgsEl.scrollTop = msgsEl.scrollHeight;

            const panel = document.getElementById('ai-panel');
            panel.setAttribute('aria-busy', 'true');
            document.getElementById('ai-send-btn').disabled = true;

            // Build context
            const sel = getSelectedText();
            let prompt = userMessage;
            if (sel && !userMessage.includes(sel)) prompt += `\n\n[Selected: "${sel.substring(0, 500)}"]`;

            const messages = [
                { role: 'system', content: 'You are Oaky, an AI writing assistant inside Okemo Word. Help the user write, edit, and improve document content. When providing rewritten or corrected text, output only the improved text without preamble or meta-commentary unless the user explicitly asks for explanation.' },
                { role: 'user', content: prompt },
            ];

            let accumulated = '';
            let requestFailed = false;
            const txtEl = document.getElementById(`${id}-txt`);

            try {
                const res = await fetch(`${BACKEND_URL}/v1/chat/completions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: currentModel,
                        messages,
                        stream: true,
                        max_tokens: 1024,
                        temperature: 0.7,
                        use_thought: false,
                    }),
                });

                if (!res.ok) throw new Error(`HTTP ${res.status}`);

                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buf = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buf += decoder.decode(value, { stream: true });

                    const lines = buf.split('\n');
                    buf = lines.pop() || '';

                    for (const line of lines) {
                        const t = line.trim();
                        if (!t.startsWith('data: ')) continue;
                        const d = t.slice(6);
                        if (d === '[DONE]') break;
                        try {
                            const tok = JSON.parse(d)?.choices?.[0]?.delta?.content || '';
                            if (tok) {
                                accumulated += tok;
                                if (txtEl) {
                                    txtEl.textContent = accumulated.replace(/<(?:think|thought)>[\s\S]*?(?:<\/(?:think|thought)>|$)/gi, '').trimStart();
                                    msgsEl.scrollTop = msgsEl.scrollHeight;
                                }
                            }
                        } catch (_) { }
                    }
                }
            } catch (err) {
                requestFailed = true;
                accumulated = 'Could not reach Oaky — check your connection and try again.';
            } finally {
                isGenerating = false;
                panel.setAttribute('aria-busy', 'false');
                document.getElementById('ai-send-btn').disabled = false;
            }

            // Finalise
            const cleanOutput = accumulated.replace(/<(?:think|thought)>[\s\S]*?(?:<\/(?:think|thought)>|$)/gi, '').trim();
            if (txtEl) {
                txtEl.textContent = cleanOutput || '(No response)';
                txtEl.classList.toggle('is-error', requestFailed);
            }

            if (!requestFailed && cleanOutput) {
                responseMap[id] = cleanOutput;
                appendResponseActions(aiDiv, id);
            }

            msgsEl.scrollTop = msgsEl.scrollHeight;
        }

        function appendResponseActions(aiDiv, id) {
            const actionsDiv = document.createElement('div');
            actionsDiv.style.cssText = 'display:flex;gap:6px;margin-top:4px;flex-wrap:wrap;';

            const insertBtn = document.createElement('button');
            insertBtn.className = 'msg-insert-btn';
            insertBtn.innerHTML = '<i class="fa-solid fa-arrow-turn-down" style="font-size:9px;"></i> Insert Below';
            insertBtn.onclick = () => insertIntoDoc(id, false);

            const replaceBtn = document.createElement('button');
            replaceBtn.className = 'msg-insert-btn';
            const hadSel = savedRange && !savedRange.collapsed;
            replaceBtn.innerHTML = hadSel
                ? '<i class="fa-solid fa-rotate" style="font-size:9px;"></i> Replace Selection'
                : '<i class="fa-solid fa-file-pen" style="font-size:9px;"></i> Replace Document';
            replaceBtn.onclick = () => insertIntoDoc(id, true);

            actionsDiv.appendChild(insertBtn);
            actionsDiv.appendChild(replaceBtn);
            aiDiv.appendChild(actionsDiv);
        }

        // ─── AI — insert into doc ──────────────────────────────────────
        function insertIntoDoc(id, replace = false) {
            const text = responseMap[id];
            if (!text) return;

            // Preserve the writing position before focus leaves the AI action.
            // WebKit fires selectionchange synchronously when the editor focuses.
            const targetRange = savedRange ? savedRange.cloneRange() : null;
            editor.focus();

            function insertPlainTextAtRange(range, value, asParagraph = false) {
                const safeRange = range.cloneRange();
                safeRange.deleteContents();
                const node = document.createElement(asParagraph ? 'p' : 'span');
                node.textContent = value;
                safeRange.insertNode(node);
                safeRange.setStartAfter(node);
                safeRange.collapse(true);
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(safeRange);
                savedRange = safeRange.cloneRange();
            }

            if (replace && targetRange && !targetRange.collapsed) {
                // Replace the selected text
                insertPlainTextAtRange(targetRange, text);
                showToast('Selection replaced');
            } else if (replace) {
                // Replace entire document
                if (!confirm('Replace the entire document with Oaky\'s response?')) return;
                editor.innerText = text;
                showToast('Document replaced');
            } else {
                // Insert below cursor/end of selection
                const r = targetRange ? (function () {
                    const rr = targetRange.cloneRange(); rr.collapse(false); return rr;
                })() : (function () {
                    const rr = document.createRange(); rr.selectNodeContents(editor); rr.collapse(false); return rr;
                })();
                insertPlainTextAtRange(r, text, true);
                showToast('Inserted into document');
            }

            updateStats();
            onEdit();
        }

        // ─── AI — clear chat ──────────────────────────────────────────
        function clearAIChat() {
            document.getElementById('ai-messages').innerHTML = `
        <div class="ai-welcome" id="ai-welcome">
            <div class="ai-welcome-icon"><i class="fa-solid fa-wand-magic-sparkles"></i></div>
            <span class="ai-welcome-kicker">Writing partner</span>
            <h4>Work on this draft</h4>
            <p>Select a passage for precise edits, or ask Oaky to help shape the whole document.</p>
        </div>`;
            responseMap = {};
            msgCounter = 0;
        }

        // ─── Utility ──────────────────────────────────────────────────
        function escHtml(s) {
            return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }
