(function (root) {
  'use strict';
  var records = new Map();
  var textSerial = 0;
  var gestureOwners = new WeakMap();
  root.LiquidDesignPluginClaim = function (host) {
    var group = host.closest('[data-lgp-group],[data-lgp-component]');
    var content = Array.from(host.children).find(function (el) { return el.matches('.lgp-content,.lgc-content'); });
    if (group && content) gestureOwners.set(group, content);
  };
  function snap(value) { return Math.round(value * 16) / 16; }
  root.LiquidDesignPluginSnap = snap;
  // Filter foreground glyphs only; never sample already-rendered glass.
  root.LiquidDesignPluginOcclusion = function (group, entries) {
    var owner = gestureOwners.get(group);
    var active = owner ? entries.find(function (item) {
      return item.content === owner && item.content.parentElement && item.content.parentElement.hasAttribute('data-lgp-front');
    }) || null : null;
    var defs = group.querySelector('svg defs');
    if (!defs) return;
    entries.forEach(function (item) {
      var content = item.content, effect = content._lgpTextEffect;
      if (!content.isConnected || !content.parentElement) return;
      function clear() {
        if (!effect) return;
        if (content.style.filter.indexOf(effect.id) !== -1) content.style.filter = effect.originalFilter;
        content.style.clipPath = effect.originalClip;
      }
      if (!active || item === active) { clear(); return; }
      var rect = content.getBoundingClientRect(), box = active.box;
      if (box.x >= rect.right || box.x+box.w <= rect.left || box.y >= rect.bottom || box.y+box.h <= rect.top) { clear(); return; }
      var matrix = new DOMMatrix(getComputedStyle(content).transform);
      var sx = Math.max(.01,Math.abs(matrix.a)), sy = Math.max(.01,Math.abs(matrix.d));
      if (!effect) {
        function node(tag, attrs) {
          var el=document.createElementNS('http://www.w3.org/2000/svg',tag);
          Object.keys(attrs).forEach(function(k){el.setAttribute(k,attrs[k]);}); return el;
        }
        var id='lgp-text-'+(++textSerial);
        var filter=node('filter',{id:id,filterUnits:'userSpaceOnUse',primitiveUnits:'userSpaceOnUse','color-interpolation-filters':'sRGB'});
        var coverParts=[];
        for(var part=0;part<2;part++) {
          var strip=node('feFlood',{'flood-color':'white',result:'strip'+part});filter.append(strip);coverParts.push(strip);
        }
        var circle='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="16" fill="white"/></svg>');
        for(var corner=0;corner<4;corner++) {
          var cap=node('feImage',{href:circle,preserveAspectRatio:'none',result:'cap'+corner});filter.append(cap);coverParts.push(cap);
        }
        var maskMerge=node('feMerge',{result:'cover'});
        ['strip0','strip1','cap0','cap1','cap2','cap3'].forEach(function(name){maskMerge.append(node('feMergeNode',{in:name}));});
        filter.append(maskMerge,node('feComposite',{in:'SourceGraphic',in2:'cover',operator:'in',result:'inside'}),
          node('feGaussianBlur',{in:'inside',stdDeviation:'2',result:'soft'}),
          node('feComposite',{in:'soft',in2:'cover',operator:'in',result:'covered'}),
          node('feComposite',{in:'SourceGraphic',in2:'cover',operator:'out',result:'sharp'}));
        var merge=node('feMerge',{});merge.append(node('feMergeNode',{in:'sharp'}),node('feMergeNode',{in:'covered'}));filter.append(merge);defs.append(filter);
        effect={id:id,filter:filter,coverParts:coverParts,originalFilter:content.style.filter,originalClip:content.style.clipPath};content._lgpTextEffect=effect;
      }
      var width=content.offsetWidth,height=content.offsetHeight;
      effect.filter.setAttribute('x','-16');effect.filter.setAttribute('y','-16');
      effect.filter.setAttribute('width',width+32);effect.filter.setAttribute('height',height+32);
      var mx=snap((box.x-rect.left)/sx),my=snap((box.y-rect.top)/sy),mw=snap(box.w/sx),mh=snap(box.h/sy);
      var mrx=Math.min(mw/2,(box.rx===undefined?Math.min(box.w,box.h)/2:box.rx)/sx);
      var mry=Math.min(mh/2,(box.ry===undefined?Math.min(box.w,box.h)/2:box.ry)/sy);
      var regions=[[mx+mrx,my,Math.max(0,mw-2*mrx),mh],[mx,my+mry,mw,Math.max(0,mh-2*mry)],
        [mx,my,2*mrx,2*mry],[mx+mw-2*mrx,my,2*mrx,2*mry],
        [mx,my+mh-2*mry,2*mrx,2*mry],[mx+mw-2*mrx,my+mh-2*mry,2*mrx,2*mry]];
      effect.coverParts.forEach(function(part,i){['x','y','width','height'].forEach(function(k,j){part.setAttribute(k,snap(regions[i][j]));});});
      content.style.filter='url(#'+effect.id+')';
      // Contain blur output in the recipient's glass, with no backdrop layer.
      var own=item.box,x=snap((own.x-rect.left)/sx),y=snap((own.y-rect.top)/sy),w=snap(own.w/sx),h=snap(own.h/sy);
      var rx=snap((own.rx===undefined?Math.min(own.w,own.h)/2:own.rx)/sx),ry=snap((own.ry===undefined?Math.min(own.w,own.h)/2:own.ry)/sy);
      content.style.clipPath='path("M'+(x+rx)+','+y+'H'+(x+w-rx)+'A'+rx+','+ry+' 0 0 1 '+(x+w)+','+(y+ry)+'V'+(y+h-ry)+
        'A'+rx+','+ry+' 0 0 1 '+(x+w-rx)+','+(y+h)+'H'+(x+rx)+'A'+rx+','+ry+' 0 0 1 '+x+','+(y+h-ry)+
        'V'+(y+ry)+'A'+rx+','+ry+' 0 0 1 '+(x+rx)+','+y+'Z")';
    });
  };
  // Blend only genuinely adjacent lobes, never every surface in a group merely
  // because one unrelated button is being touched.
  root.LiquidDesignPluginContours = function (boxes, strength, exactPath) {
    var remaining = boxes.slice(), paths = [], connections = 0;
    while (remaining.length) {
      var cluster = [remaining.shift()], changed = true;
      while (changed) {
        changed = false;
        for (var i = remaining.length - 1; i >= 0; i--) {
          var b = remaining[i];
          if (cluster.some(function (a) {
            var dx = Math.max(0, a.x - b.x - b.w, b.x - a.x - a.w);
            var dy = Math.max(0, a.y - b.y - b.h, b.y - a.y - a.h);
            return Math.hypot(dx, dy) <= strength;
          })) { cluster.push(remaining.splice(i, 1)[0]); changed = true; }
        }
      }
      if (cluster.length === 1) paths.push(exactPath(cluster[0]));
      else {
        // The blend must begin at zero as the gap enters the proximity band.
        // A full-strength union at the threshold creates an instant broad neck.
        var closestGap = strength;
        for (var a = 0; a < cluster.length; a++) for (var b = a + 1; b < cluster.length; b++) {
          var dx = Math.max(0, cluster[a].x - cluster[b].x - cluster[b].w, cluster[b].x - cluster[a].x - cluster[a].w);
          var dy = Math.max(0, cluster[a].y - cluster[b].y - cluster[b].h, cluster[b].y - cluster[a].y - cluster[a].h);
          closestGap = Math.min(closestGap, Math.hypot(dx, dy));
        }
        var localStrength = Math.max(.1, strength - closestGap);
        var union = root.LiquidDesignUnion.outline(cluster, localStrength, true);
        paths.push(union.path); connections += union.connections;
      }
    }
    return { path: paths.join(' '), connections: connections };
  };
  function selected(scope, selector) {
    var list = Array.from(scope.querySelectorAll(selector));
    if (scope.matches && scope.matches(selector)) list.unshift(scope);
    return list;
  }
  function snapshot(el) {
    var names = ['style', 'class', 'hidden', 'inert', 'aria-hidden', 'aria-controls', 'aria-expanded', 'aria-haspopup',
      'data-liquid-cluster', 'data-liquid-button', 'data-liquid-toggle', 'data-liquid-menu', 'data-liquid-highlighted',
      'data-expanded', 'data-morph-phase', 'data-menu-direction', 'data-lgp-component', 'data-lgp-theme'];
    var values = names.map(function (name) { return el.getAttribute(name); });
    return function () { names.forEach(function (name, i) {
      if (values[i] === null) el.removeAttribute(name); else el.setAttribute(name, values[i]);
    }); };
  }
  root.LiquidDesignPluginComponents = {
    owns: function (el) { return !!el.closest('[data-lgp-component]'); },
    refresh: function (scope) {
      selected(scope, '[data-liquid-design-component]').forEach(function (group) {
        if (records.has(group)) { root.LiquidDesignComponents.init(group); return; }
        var kind = group.getAttribute('data-liquid-design-component');
        if (kind !== 'tools' && kind !== 'options') return;
        var trigger = group.querySelector('[data-liquid-design-toggle]');
        var panel = trigger && document.getElementById(trigger.getAttribute('data-liquid-design-toggle'));
        if (!panel || !group.contains(panel)) return;
        var restore = [group, trigger, panel].concat(Array.from(panel.querySelectorAll('[data-liquid-design]'))).map(snapshot);
        group.setAttribute('data-lgp-component', kind); group.setAttribute('data-liquid-cluster', '');
        var themeOwner = group.closest('[data-liquid-design-theme]');
        group.setAttribute('data-lgp-theme', themeOwner && themeOwner.getAttribute('data-liquid-design-theme') || 'auto');
        trigger.setAttribute('data-liquid-button', ''); trigger.setAttribute('data-liquid-toggle', panel.id);
        if (kind === 'options') { panel.setAttribute('data-liquid-menu', ''); trigger.setAttribute('aria-haspopup', 'true'); }
        else {
          panel.classList.add('lgd-tools');
          function positionTools() {
            if (trigger.getAttribute('aria-expanded') === 'true') return;
            var anchor = trigger.getBoundingClientRect(), g = group.getBoundingClientRect();
            var center = anchor.left + anchor.width / 2;
            var direction = center <= innerWidth / 2 ? 'right' : 'left';
            group.setAttribute('data-lgp-tools-direction', direction);
            var items = Array.from(panel.querySelectorAll('[data-liquid-design]'));
            var gap = parseFloat(getComputedStyle(group).getPropertyValue('--liquid-design-tools-gap'));
            if (!Number.isFinite(gap)) gap = 9;
            var offset = 0;
            items.forEach(function (item, i) {
              var style = getComputedStyle(item), width = parseFloat(style.width) || 52, height = parseFloat(style.height) || 52, x;
              if (direction === 'right') x = anchor.right - g.left + gap + offset;
              else x = anchor.left - g.left - gap - offset - width;
              item.style.left = x + 'px';
              item.style.top = anchor.top - g.top + (anchor.height - height) / 2 + 'px';
              offset += width + gap;
            });
          }
          positionTools();
          trigger.addEventListener('pointerdown', positionTools, true);
          trigger.addEventListener('click', positionTools, true);
          root.addEventListener('resize', positionTools);
          restore.push(function () {
            trigger.removeEventListener('pointerdown', positionTools, true); trigger.removeEventListener('click', positionTools, true);
            root.removeEventListener('resize', positionTools); group.removeAttribute('data-lgp-tools-direction');
          });
        }
        panel.querySelectorAll('[data-liquid-design]').forEach(function (el) { el.setAttribute('data-liquid-button', ''); });
        function blockUnavailable(event) {
          var control = event.target.closest('[data-liquid-button]');
          if (control && control.getAttribute('aria-disabled') === 'true') {
            event.preventDefault(); event.stopImmediatePropagation();
          }
        }
        function blockDrag(event) { event.preventDefault(); }
        var gesture = null, actionDragged = false;
        function pointerDown(event) {
          var control = event.target.closest('[data-liquid-button]');
          if (kind !== 'tools' || !control || control === trigger || event.button !== 0) return;
          gesture = { id: event.pointerId, el: control, x: event.clientX, y: event.clientY }; actionDragged = false;
        }
        function pointerMove(event) {
          if (gesture && gesture.id === event.pointerId && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 2) actionDragged = true;
        }
        function guardAction(event) {
          if (gesture && event.target.closest('[data-liquid-button]') === gesture.el && event.detail !== 0 && actionDragged) {
            event.preventDefault(); event.stopImmediatePropagation(); actionDragged = false;
          }
        }
        group.addEventListener('pointerdown', pointerDown, true);
        group.addEventListener('pointermove', pointerMove, true);
        group.addEventListener('pointerup', pointerMove, true);
        group.addEventListener('click', guardAction, true);
        restore.push(function () {
          group.removeEventListener('pointerdown', pointerDown, true); group.removeEventListener('pointermove', pointerMove, true);
          group.removeEventListener('pointerup', pointerMove, true); group.removeEventListener('click', guardAction, true);
        });
        group.addEventListener('click', blockUnavailable, true);
        group.addEventListener('dragstart', blockDrag, true);
        restore.push(function () { group.removeEventListener('click', blockUnavailable, true); group.removeEventListener('dragstart', blockDrag, true); });
        records.set(group, { restore: restore }); root.LiquidDesignComponents.init(group);
      });
    },
    destroy: function (scope) {
      Array.from(records.keys()).forEach(function (group) {
        if (scope !== document && scope !== group && !scope.contains(group) && !group.contains(scope)) return;
        root.LiquidDesignComponents.destroy(group);
        records.get(group).restore.reverse().forEach(function (fn) { fn(); }); records.delete(group);
      });
    },
    prune: function () { Array.from(records.keys()).forEach(function (group) { if (!group.isConnected) root.LiquidDesignPluginComponents.destroy(group); }); },
  };
})(window);
