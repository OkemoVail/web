(function () {
  'use strict';
  document.querySelectorAll('.lgd-track, .lgd-example-stage, .scene').forEach(function (scene) {
    scene.setAttribute('data-liquid-color-scene', '');
    var palette = [['Red rectangle','#ef3340'],['Blue circle','#1677ed'],['Yellow square','#f5be20']];
    function notify() { scene.dispatchEvent(new CustomEvent('liquid-color-change',{bubbles:true})); }
    palette.forEach(function (entry, index) {
      var object = document.createElement('button'); object.type='button'; object.className='lg-color-object lg-color-object--'+index;
      object.setAttribute('data-liquid-color-source',''); object.setAttribute('aria-label',entry[0]+' — drag or use arrow keys');
      object.title='Drag me near the glass. Arrow keys move; Shift moves faster.'; object.style.backgroundColor=entry[1];
      object.style.left=(index === 0 ? 6 : index === 1 ? 78 : 50)+'%'; object.style.top=(index === 1 ? 72 : 12)+'%';
      scene.append(object);
      function move(x,y) {
        object.style.left=Math.max(0,Math.min(scene.clientWidth-object.offsetWidth,x))+'px';
        object.style.top=Math.max(0,Math.min(scene.clientHeight-object.offsetHeight,y))+'px'; notify();
      }
      var pointer=null, origin=null;
      object.addEventListener('pointerdown',function(e){
        if(e.button!==0) return; e.preventDefault(); object.focus({preventScroll:true});
        pointer=e.pointerId; origin={x:e.clientX,y:e.clientY,left:object.offsetLeft,top:object.offsetTop}; object.setPointerCapture(pointer);
      });
      object.addEventListener('pointermove',function(e){if(e.pointerId===pointer)move(origin.left+e.clientX-origin.x,origin.top+e.clientY-origin.y);});
      ['pointerup','pointercancel','lostpointercapture'].forEach(function(name){object.addEventListener(name,function(){pointer=null;});});
      object.addEventListener('keydown',function(e){
        var directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}, d=directions[e.key];
        if(!d)return; e.preventDefault(); var step=e.shiftKey?24:8; move(object.offsetLeft+d[0]*step,object.offsetTop+d[1]*step);
      });
      window.addEventListener('resize',function(){move(object.offsetLeft,object.offsetTop);});
    });
    notify();
  });
})();
