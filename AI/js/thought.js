// ─── Thought Parsing & Display ─────────────────────────────────

window.parseThought = (text) => {
    if (!text) return { thought: null, content: "" };
    const thoughtRegex = /(?:<|&lt;)(?:thought|think|\|begin_of_thought\||\|thought\|)(?:[\s\S]*?)(?:>|&gt;)([\s\S]*?)(?:(?:<|&lt;)(?:\/(?:thought|think)|\|end_of_thought\||\|thought\|)(?:>|&gt;)|$)/i;
    const match = text.match(thoughtRegex);
    if (match) {
        const thoughtContent = match[1].trim();
        const remainingText = text.replace(match[0], '').trim();
        return { thought: thoughtContent, content: remainingText };
    }
    return { thought: null, content: text };
};

window.toggleThought = (btn) => {
    const container = btn.closest('.thought-container');
    const content = container.querySelector('.thought-content');
    const icon = btn.querySelector('.chevron-icon');

    const isExpanded = content.classList.contains('expanded');

    if (isExpanded) {
        content.classList.remove('expanded');
        if (icon) icon.style.transform = 'rotate(0deg)';
    } else {
        content.classList.add('expanded');
        if (icon) icon.style.transform = 'rotate(180deg)';
    }
};

window.isInsideThought = (text) => {
    const thoughtTags = ['<thought>', '<think>', '<|begin_of_thought|>', '<|thought|>'];
    const endTags = ['</thought>', '</think>', '<|end_of_thought|>', '<|thought|>'];
    let lastStart = -1;
    let lastEnd = -1;
    thoughtTags.forEach(tag => {
        const idx = text.lastIndexOf(tag);
        if (idx > lastStart) lastStart = idx;
    });
    endTags.forEach(tag => {
        const idx = text.lastIndexOf(tag);
        if (idx > lastEnd) lastEnd = idx;
    });
    return lastStart > lastEnd;
};
