// Готові дії для A-Frame. Учнівський код використовує VRTools.jump().
(() => {
  const active = new WeakMap();
  function jump(figure, height = 1, duration = 350) {
    if (!figure?.object3D) throw new Error('VRTools.jump: фігуру не знайдено. Перевір її id.');
    if (!Number.isFinite(height) || height < 0 || !Number.isFinite(duration) || duration <= 0) {
      throw new Error('VRTools.jump: висота має бути невід’ємним числом, час — додатним числом у мс.');
    }
    active.get(figure)?.();
    const start = {...figure.getAttribute('position')};
    const finish = () => {
      figure.removeEventListener('animationcomplete__studentjump', finish);
      figure.removeAttribute('animation__studentjump');
      figure.setAttribute('position', start);
      active.delete(figure);
    };
    active.set(figure, finish);
    figure.addEventListener('animationcomplete__studentjump', finish, {once: true});
    figure.setAttribute('animation__studentjump', {
      property: 'position', from: `${start.x} ${start.y} ${start.z}`,
      to: `${start.x} ${start.y + height} ${start.z}`,
      dur: duration, loop: 2, dir: 'alternate', easing: 'easeInOutSine'
    });
  }
  window.VRTools = {jump};
})();
