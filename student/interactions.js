// Твій код: обери фігуру, підпишися на подію, задай реакцію.
const scene = document.querySelector('a-scene');
if (scene.hasLoaded) setup();
else scene.addEventListener('loaded', setup, {once: true});

function setup() {
  const sphere = document.querySelector('#sphere');
  const originalColor = sphere.getAttribute('color');

  sphere.addEventListener('click', () => {
    VRTools.jump(sphere, 1, 350); // висота в метрах, час підйому в мс
  });

  sphere.addEventListener('mouseenter', () => {
    sphere.setAttribute('color', '#ffcc00');
  });

  sphere.addEventListener('mouseleave', () => {
    sphere.setAttribute('color', originalColor);
  });

  // Спробуй додати реакцію кубу або циліндру за тим самим зразком.
}
