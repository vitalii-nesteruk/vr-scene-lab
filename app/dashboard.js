// Інструменти редактора живуть окремо від навчальної HTML-сцени.
(() => {
  const scene = document.querySelector('a-scene');
  if (scene.hasLoaded) init();
  else scene.addEventListener('loaded', init, {once: true});

  function init() {
    const THREE = AFRAME.THREE;
    const originalObjects = [...scene.querySelectorAll('[data-editor-name]')];
    let objects = [...originalObjects];
    let selected = objects[0];
    let drag = null;
    let hovered = null;
    let nextId = 1;
    const defaults = new Map();
    const pending = new Set();
    const drafts = new Map();
    const codeErrors = new Map();
    const animations = new Map();
    const jumps = new Map();
    const jsDrafts = new Map();
    const handlers = new Map();
    const starterJS = el => `// Знаходимо фігуру за її id у HTML.
const figure = document.querySelector("#${el.id}");

// Запам’ятовуємо початкове положення під час стрибка.
let startPosition = null;

function cancelJump() {
  if (!startPosition) return;
  figure.removeEventListener('animationcomplete__jump', cancelJump);
  figure.removeAttribute('animation__jump');
  figure.setAttribute('position', startPosition);
  startPosition = null;
}

function jump(height, duration) {
  cancelJump();
  const {x, y, z} = figure.getAttribute('position');
  startPosition = {x, y, z};
  // A-Frame анімує підйом і повернення.
  figure.setAttribute('animation__jump', {
    property: 'position',
    from: \`\${x} \${y} \${z}\`,
    to: \`\${x} \${y + height} \${z}\`,
    dur: duration, loop: 2, dir: 'alternate',
    easing: 'easeInOutSine'
  });
  figure.addEventListener('animationcomplete__jump', cancelJump, {once: true});
}

// Обробник викликається, коли користувач клацає фігуру.
function onClick(event) {
  jump(1, 350);
}

// Прив’язуємо подію до функції-обробника.
figure.addEventListener('click', onClick);

figure.addEventListener('mouseenter', () => {
  figure.setAttribute('color', '#ffcc00');
});

figure.addEventListener('mouseleave', () => {
  figure.setAttribute('color', '#e9b44c');
});

// Події переміщення, які надсилає редактор:
// figure.addEventListener('vr-drag-start', () => { ... });
// figure.addEventListener('vr-drag-end', () => { ... });`;
    let shadowsEnabled = false;
    let geometryOwner = null;
    const fields = [
      {key: 'x', label: 'Ліворуч / праворуч · x', group: 'position', axis: 'x', min: -5, max: 5, step: 0.05},
      {key: 'y', label: 'Висота · y', group: 'position', axis: 'y', min: -5, max: 5, step: 0.05},
      {key: 'z', label: 'Глибина · z', group: 'position', axis: 'z', min: -8, max: 8, step: 0.05},
      ...['x', 'y', 'z'].map(axis => ({key: `rotation-${axis}`, label: `Вісь ${axis} · градуси`, group: 'rotation', axis, min: -180, max: 180, step: 1})),
      ...['x', 'y', 'z'].map(axis => ({key: `scale-${axis}`, label: `Вісь ${axis}`, group: 'scale', axis, min: 0.1, max: 3, step: 0.05})),
      {key: 'size', label: 'Рівномірний масштаб', group: 'scale', axis: 'x', min: 0.4, max: 2, step: 0.1},
    ];
    const figures = {
      box: {name: 'Куб', y: 0.5, color: '#F2766B', attrs: {width: 1, height: 1, depth: 1}},
      sphere: {name: 'Куля', y: 0.55, color: '#E9B44C', attrs: {radius: 0.55}},
      cylinder: {name: 'Циліндр', y: 0.65, color: '#147D91', attrs: {radius: 0.43, height: 1.3}},
      cone: {name: 'Конус', y: 0.6, color: '#A36AC7', attrs: {'radius-bottom': 0.5, 'radius-top': 0, height: 1.2}},
      torus: {name: 'Бублик', y: 0.69, color: '#E98535', attrs: {radius: 0.55, 'radius-tubular': 0.14}},
    };
    const dimensions = {
      box: [['width', 'Ширина'], ['height', 'Висота'], ['depth', 'Глибина']],
      sphere: [['radius', 'Радіус']],
      cylinder: [['radius', 'Радіус'], ['height', 'Висота']],
      cone: [['radius-bottom', 'Радіус основи'], ['radius-top', 'Радіус вершини'], ['height', 'Висота']],
      torus: [['radius', 'Радіус тора'], ['radius-tubular', 'Радіус трубки']],
    };
    const kindOf = el => el.tagName.toLowerCase().slice(2);
    const dimensionValue = (el, key) => Number(el.getAttribute(key) ?? el.getAttribute('geometry')[key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())]);
    const neat = n => Number(Number(n).toFixed(6));
    const vector = v => [v.x, v.y, v.z].map(neat).join(' ');
    const current = group => animations.get(selected.id)?.base[group] ?? selected.getAttribute(group);
    const round = n => Math.round(n * 100) / 100;
    const format = n => round(n).toString().replace('.', ',');
    for (const el of objects) remember(el);
    const initialFigures = originalObjects.map(el => ({
      tag: el.tagName.toLowerCase(), id: el.id, name: el.dataset.editorName,
      attributes: {...defaults.get(el.id)},
    }));
    const cameraEl = scene.camera.el;
    const initialCamera = {
      position: vector(cameraEl.getAttribute('position')),
      rotation: vector(cameraEl.getAttribute('rotation')),
      yaw: cameraEl.components['look-controls']?.yawObject.rotation.y ?? 0,
      pitch: cameraEl.components['look-controls']?.pitchObject.rotation.x ?? 0,
    };

    const style = document.createElement('style');
    style.textContent = `
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Arial, sans-serif; color: #173149; }
      .vr-panel { position: fixed; z-index: 10; top: 16px; right: 16px; width: 390px; max-height: calc(100vh - 32px); overflow: auto; padding: 19px; background: #f5fafcf5; border: 1px solid #bedad8; border-radius: 12px; box-shadow: 0 10px 30px #17314930; }
      .vr-panel h1 { margin: 0 0 5px; font-size: 24px; line-height: 1.2; }
      .vr-panel p { margin: 0 0 12px; font-size: 14px; line-height: 1.4; }
      .vr-panel h2 { margin: 16px 0 9px; font-size: 15px; }
      .vr-objects, .vr-actions, .vr-add { display: flex; gap: 6px; }
      .vr-objects { flex-wrap: wrap; max-height: 128px; overflow: auto; }
      .vr-panel button, .vr-panel select { min-height: 36px; border: 1px solid #98c1bf; border-radius: 7px; background: white; color: #173149; font: 700 13px Arial, sans-serif; cursor: pointer; }
      .vr-objects button { flex: 1 0 85px; padding: 5px; border-bottom: 4px solid var(--swatch); }
      .vr-objects button[aria-pressed="true"] { background: #006e77; color: white; border-color: #006e77; border-bottom-color: var(--swatch); }
      .vr-add { margin-top: 10px; }
      .vr-add select { flex: 1; min-width: 0; padding: 5px; font-weight: 400; }
      .vr-add button { padding: 5px 14px; background: #006e77; color: white; }
      .vr-panel button:disabled { opacity: 0.45; cursor: default; }
      .vr-panel button:focus-visible, .vr-panel input:focus-visible, .vr-panel select:focus-visible { outline: 3px solid #e9b44c; outline-offset: 2px; }
      .vr-field { display: block; margin: 9px 0 11px; }
      .vr-field-head { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; }
      .vr-number { width: 84px; min-width: 0; padding: 3px 5px; border: 1px solid #98c1bf; border-radius: 4px; color: #173149; background: white; font: 14px 'Courier New', monospace; }
      .vr-field-head { align-items: center; }
      .vr-panel details { margin: 12px 0; border-top: 1px solid #bedad8; padding-top: 10px; }
      .vr-panel summary { font-size: 14px; font-weight: 700; cursor: pointer; }
      .vr-dimension { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 10px; font-size: 13px; }
      .vr-effect { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 12px; font-size: 13px; }
      .vr-effect select { max-width: 200px; padding: 5px; font-weight: 400; }
      .vr-effect input[type="checkbox"] { width: 18px; height: 18px; accent-color: #006e77; }
      .vr-effect input[type="range"] { width: 180px; accent-color: #006e77; }
      .vr-stop { width: 100%; margin-top: 10px; }
      .vr-code-message { min-height: 18px; margin: 7px 0 12px !important; font-size: 12px !important; color: #527081; }
      .vr-code-message.is-error { color: #a32924; }
      .vr-code-actions { display: flex; gap: 6px; }
      .vr-code-actions button { flex: 1; padding: 6px; }
      .vr-code-actions [data-apply-code], .vr-code-actions [data-js-apply] { background: #006e77; color: white; }
      .vr-field input[type="range"] { display: block; width: 100%; margin: 7px 0 0; accent-color: #006e77; }
      .vr-color { display: flex; align-items: center; justify-content: space-between; gap: 15px; font-size: 13px; }
      .vr-color input { width: 72px; height: 36px; padding: 1px; border: 1px solid #98c1bf; border-radius: 5px; background: white; }
      .vr-code { display: block; width: 100%; min-height: 0; resize: none; margin: 12px 0 8px; padding: 11px; border: 1px solid #527081; white-space: pre; overflow-x: auto; overflow-y: hidden; background: #122c3d; color: white; border-radius: 7px; font: 13px/1.5 'Courier New', monospace; tab-size: 2; }
      .vr-actions { flex-wrap: wrap; }
      .vr-actions button { flex: 1 0 125px; padding: 5px; font-size: 12px; }
      .vr-tip, .vr-status { margin: 10px 0 0 !important; color: #527081; font-size: 12px !important; }
      .vr-panel .vr-toggle { float: right; min-height: 25px; border: 0; background: transparent; color: #006e77; }
      .vr-panel.is-collapsed { width: 190px; max-height: 55px; overflow: hidden; padding: 15px; }
      .vr-panel.is-collapsed > :not(.vr-toggle) { display: none; }
      .vr-hidden .vr-panel { display: none; }
      @media (max-width: 650px) { .vr-panel { top: auto; right: 8px; bottom: 8px; left: 8px; width: auto; max-height: 55vh; padding: 13px; } .vr-panel h1 { font-size: 20px; } }
    `;
    document.head.append(style);
    const panel = document.createElement('aside');
    panel.className = 'vr-panel';
    panel.setAttribute('aria-label', 'Панель керування VR-сценою');
    panel.innerHTML = `
      <button type="button" class="vr-toggle" aria-expanded="true">Сховати</button>
      <h1>Просторова сцена</h1>
      <p>Пересувай фігури мишкою та змінюй їхні розміри, поворот і колір у панелі.</p>
      <h2>Об’єкти</h2><div class="vr-objects" role="group" aria-label="Вибір об’єкта"></div>
      <div class="vr-add"><select aria-label="Фігура для додавання" data-add-kind>
        <option value="cone">Конус</option><option value="torus">Бублик (тор)</option>
        <option value="box">Куб</option><option value="sphere">Куля</option><option value="cylinder">Циліндр</option>
      </select><button type="button" data-add>+ Додати</button></div>
      <p class="vr-status" role="status"></p>
      <details open><summary>Положення · метри</summary><div class="vr-fields" data-group="position"></div></details>
      <details open><summary>Поворот · градуси</summary><div class="vr-fields" data-group="rotation"></div></details>
      <details><summary>Масштаб · множники</summary><div class="vr-fields" data-group="scale"></div></details>
      <details><summary>Розміри фігури · метри</summary><div class="vr-dimensions"></div></details>
      <label class="vr-color">Колір <input type="color" data-color aria-label="Колір обраного об’єкта"></label>
      <details data-effects><summary>Тіні й анімація</summary>
        <label class="vr-effect">Стрибок за кліком <input type="checkbox" data-click-jump></label>
        <p class="vr-tip">Увімкни й клацни фігуру: вона підстрибне та повернеться. Перетягування рухає її по сцені.</p>
        <label class="vr-effect">Тіні в усій сцені <input type="checkbox" data-shadows></label>
        <label class="vr-effect">Анімація фігури <select data-animation-kind data-animation-control>
          <option value="none">Без анімації</option><option value="spin">Обертання</option>
          <option value="float">Вгору-вниз</option><option value="pulse">Пульсація</option>
          <option value="custom" hidden>Власна з HTML</option>
        </select></label>
        <label class="vr-effect">Тривалість · <output data-duration-label>4 с</output>
          <input type="range" min="1" max="10" step="0.5" value="4" data-animation-duration data-animation-control aria-label="Тривалість анімації в секундах">
        </label>
        <button type="button" class="vr-stop" data-stop-animation data-animation-control>Зупинити рух</button>
        <p class="vr-tip">Клік по фігурі зупиняє її безперервну анімацію; якщо ввімкнено стрибок, запускає його. Обертання найкраще видно на кубі.</p>
      </details>
      <details data-practice><summary>Практична: інтерактивна виставка</summary>
        <p class="vr-tip"><strong>Задум:</strong> створи виставку дивних експонатів, які реагують на відвідувача. Працюй із готовими фігурами й прикладами коду.</p>
        <ol class="vr-tip">
          <li>Обери тему й розмісти 3 фігури. Виділи головний експонат.</li>
          <li>Додай безперервну анімацію одному експонату через «Тіні й анімація». Порівняй дві тривалості.</li>
          <li>Обери іншу фігуру, відкрий «JavaScript: реакції фігури» й натисни «Застосувати JS». Скористайся довідкою «Спочатку: як код знаходить фігуру». Знайди document.querySelector, функцію onClick та її підписку addEventListener. Перевір стрибок за кліком і зміну кольору при наведенні та відведенні миші. Зміни висоту у виклику jump(1, 350) або кольори в готових функціях.</li>
          <li>Перевір усі реакції. Рухомий експонат має залишатися помітним, а підказка кольором — зрозумілою. Обирай рухому фігуру через список, щоб не зупиняти її кліком.</li>
          <li>Зроби скриншот і запиши: яка подія запускає яку дію? Як тривалість впливає на швидкість? Покажи реакції вчителю або запиши коротке відео.</li>
        </ol>
        <p class="vr-tip">Додатково: зміни колір фігури на початку й після завершення перетягування. Визначення jump можна поки залишити готовим — для вправи достатньо змінювати її виклик.</p>
        <p class="vr-tip">Хочеш попрацювати у файлах? <a href="https://github.com/vitalii-nesteruk/vr-scene-lab" target="_blank" rel="noopener noreferrer">Репозиторій на GitHub</a>: Code → Download ZIP, потім розпакуй архів. Відкрий student/index.html у браузері, а student/interactions.js — у редакторі коду (наприклад, <a href="https://code.visualstudio.com/download" target="_blank" rel="noopener noreferrer">VS Code</a>). Збережи зміни й онови браузер. Інтернет потрібен для A-Frame.</p>
        <p class="vr-tip"><a href="student/index.html" target="_blank" rel="noopener noreferrer">Відкрити учнівський приклад</a>. Файли student/ призначені для твоїх змін; app/ містить панель, lib/ — готові допоміжні функції.</p>
        <p class="vr-tip">Збережи скриншот і потрібний JS до перезавантаження: сцена та код автоматично не зберігаються.</p>
      </details>
      <details data-selector-guide><summary>Спочатку: як код знаходить фігуру</summary>
        <p class="vr-tip">HTML описує фігури сцени, JavaScript задає реакції. Селектор — це запис, за яким код знаходить потрібний елемент на сторінці.</p>
        <pre class="vr-code">// HTML: у кулі є ім’я-ідентифікатор sphere.
&lt;a-sphere id="sphere" …&gt;&lt;/a-sphere&gt;

// JavaScript: знаходимо саме цю кулю.
const figure = document.querySelector('#sphere');</pre>
        <p class="vr-tip"><code>id="sphere"</code> — унікальний ідентифікатор фігури. <code>#sphere</code> означає «елемент із таким id»; # пишемо в селекторі, а не в id. <code>document.querySelector(...)</code> шукає перший відповідний елемент. <code>figure</code> — назва змінної, у якій зберігаємо знайдену фігуру.</p>
        <p class="vr-tip">Для куба приклад — <code>#cube</code>. Для доданої фігури подивись id у полі «HTML обраної фігури»: її JS-приклад уже містить потрібний селектор. Якщо написати неіснуючий id, фігура не знайдеться. У кожного об’єкта має бути власний id.</p>
        <p class="vr-tip">На майбутнє: <code>.interactive</code> шукає за класом, <code>a-sphere</code> — за назвою тега. Клас може об’єднувати кілька фігур; querySelector повертає першу. Для цієї роботи достатньо селектора за id.</p>
        <p class="vr-tip">Далі <code>figure.addEventListener('click', onClick)</code> означає: «коли по цій фігурі клацнуть, виконай функцію onClick». Ця функція — обробник події; усередині неї описуємо дію.</p>
      </details>
      <details data-event-guide><summary>Довідка: події користувача</summary>
        <p class="vr-tip">Приклад: обери фігуру, зареєструй обробник і визнач дію.</p>
        <pre class="vr-code">const figure = document.querySelector('#sphere');

function highlight(event) {
  figure.setAttribute('color', '#ffcc00');
}

figure.addEventListener('mouseenter', highlight);</pre>
        <p class="vr-tip">Подія — що зробив користувач. Обробник — функція, яку панель викликає у відповідь для цієї фігури.</p>
        <ul class="vr-tip">
          <li><code>'click'</code> — короткий клік: наприклад, стрибок.</li>
          <li><code>'mouseenter'</code> — навів вказівник: виділити кольором.</li>
          <li><code>'mouseleave'</code> — відвів вказівник: повернути колір.</li>
          <li><code>'vr-drag-start'</code> — почав тягнути: позначити переміщення.</li>
          <li><code>'vr-drag-end'</code> — відпустив після перетягування: показати завершення.</li>
        </ul>
        <p class="vr-tip">У функціях можна використати <code>figure.setAttribute('color', '#ff0000');</code>. У цьому редакторі панель надсилає події на 3D-фігури; addEventListener підписує на них ваші функції. vr-drag-start та vr-drag-end — події нашого редактора. Саме перетягування не запускає click. Почни з миші на комп’ютері.</p>
      </details>
      <details data-js-editor><summary>JavaScript: реакції фігури</summary>
        <p class="vr-tip">Селектор знаходить фігуру за id з HTML. addEventListener прив’язує обробники до подій фігури. Зміни код і натисни «Застосувати JS».</p>
        <textarea class="vr-code" data-js-code aria-label="JavaScript обраної фігури" spellcheck="false" autocapitalize="off"></textarea>
        <div class="vr-code-actions"><button type="button" data-js-apply>Застосувати JS</button><button type="button" data-js-clear>Прибрати реакцію</button></div>
        <p class="vr-code-message" data-js-message role="status" aria-live="polite"></p>
        <p class="vr-tip">JS запускається у цій сторінці: застосовуй лише код, якому довіряєш. Перетягування не запускає клік.</p>
      </details>
      <h2>HTML обраної фігури</h2>
      <p class="vr-tip">Зміни параметри й натисни «Застосувати» або ⌘/Ctrl+Enter.</p>
      <textarea class="vr-code" aria-label="HTML обраної фігури" spellcheck="false" autocapitalize="off" autocomplete="off"></textarea>
      <div class="vr-code-actions"><button type="button" data-apply-code>Застосувати</button><button type="button" data-reset-camera>Скинути камеру</button></div>
      <p class="vr-code-message" data-html-message role="status" aria-live="polite"></p>
      <div class="vr-actions"><button type="button" data-reset="one">Скинути обраний</button><button type="button" data-reset="all">Початкова сцена</button><button type="button" data-remove>Прибрати фігуру</button></div>
      <p class="vr-tip">Клік вибирає фігуру. Перетягування змінює x і z, зберігаючи висоту. Тягни порожнє місце, щоб озирнутися. Після збільшення фігури перевір її опору на підлогу.</p>
    `;
    document.body.append(panel);
    const clean = new URLSearchParams(location.search).get('clean') === '1';
    document.body.classList.toggle('vr-hidden', clean);
    const toggle = panel.querySelector('.vr-toggle');
    toggle.addEventListener('click', () => {
      const collapsed = panel.classList.toggle('is-collapsed');
      toggle.textContent = collapsed ? 'Показати панель' : 'Сховати';
      toggle.setAttribute('aria-expanded', String(!collapsed));
      if (!collapsed) resizeCode();
    });
    const objectBar = panel.querySelector('.vr-objects');
    const geometryBox = panel.querySelector('.vr-dimensions');
    const colorInput = panel.querySelector('[data-color]');
    const code = panel.querySelector('textarea.vr-code:not([data-js-code])');
    const jsCode = panel.querySelector('[data-js-code]');
    const jsMessage = panel.querySelector('[data-js-message]');
    const codeMessage = panel.querySelector('[data-html-message]');
    const status = panel.querySelector('.vr-status');
    const animationKind = panel.querySelector('[data-animation-kind]');
    const animationDuration = panel.querySelector('[data-animation-duration]');
    const shadowToggle = panel.querySelector('[data-shadows]');
    const outline = new THREE.BoxHelper(undefined, 0x006e77);
    outline.material.depthTest = false;
    outline.material.transparent = true;
    outline.material.opacity = 0.8;
    outline.renderOrder = 2;
    outline.visible = false;
    scene.object3D.add(outline);
    // Рамка стежить за фігурою, поки сама анімація працює через A-Frame.
    AFRAME.registerComponent('vr-editor-selection', {
      tick() {
        if (selected && animations.has(selected.id)) {
          selected.object3D.updateMatrixWorld(true);
          outline.setFromObject(selected.object3D);
        }
      },
    });
    scene.setAttribute('vr-editor-selection', '');
    const defaultLights = [...scene.querySelectorAll('[data-aframe-default-light]')].map(el => el.getAttribute('light'));
    const ambientDefaults = defaultLights.find(light => light.type === 'ambient') ?? {color: '#BBB', intensity: 3.14};
    const sunDefaults = defaultLights.find(light => light.type === 'directional') ?? {color: '#FFF', intensity: 1.884};
    const lightTarget = document.createElement('a-entity');
    lightTarget.id = 'vr-editor-light-target';
    scene.append(lightTarget);
    const ambientLight = document.createElement('a-entity');
    ambientLight.setAttribute('light', `type: ambient; color: ${ambientDefaults.color}; intensity: ${ambientDefaults.intensity}`);
    scene.append(ambientLight);
    const sunLight = document.createElement('a-entity');
    sunLight.setAttribute('position', '-0.5 1 1');
    sunLight.setAttribute('light', `type: directional; color: ${sunDefaults.color}; intensity: ${sunDefaults.intensity}; target: #vr-editor-light-target; castShadow: false; shadowCameraLeft: -14; shadowCameraRight: 14; shadowCameraTop: 14; shadowCameraBottom: -14; shadowCameraFar: 60; shadowMapWidth: 1024; shadowMapHeight: 1024; shadowBias: -0.0001`);
    scene.append(sunLight);
    scene.setAttribute('shadow', 'type: pcf');
    scene.querySelectorAll('a-sky').forEach(el => el.setAttribute('shadow', 'cast: false; receive: false'));
    const jumpToggle = panel.querySelector('[data-click-jump]');
    jumpToggle.addEventListener('change', () => { if (!jumpToggle.checked) [...jumps.keys()].forEach(stopJump); refresh(); });
    shadowToggle.addEventListener('change', () => { setShadows(shadowToggle.checked); refresh(); });
    animationKind.addEventListener('change', () => {
      if (!selected || animationKind.value === 'custom') return;
      if (animationKind.value === 'none') stopAnimation(selected);
      else startAnimation(selected, animationKind.value, Number(animationDuration.value));
      refresh();
    });
    animationDuration.addEventListener('input', () => {
      if (!selected) return;
      const motion = animations.get(selected.id);
      if (motion) startAnimation(selected, motion.kind, Number(animationDuration.value), motion.kind === 'custom' ? {...motion.config, dur: Number(animationDuration.value) * 1000} : null);
      refresh();
    });
    panel.querySelector('[data-stop-animation]').addEventListener('click', () => {
      if (selected) stopAnimation(selected);
      refresh();
    });

    for (const field of fields) {
      const label = document.createElement('label');
      label.className = 'vr-field';
      label.innerHTML = `<span class="vr-field-head"><span>${field.label}</span></span>`;
      const input = document.createElement('input');
      Object.assign(input, {type: 'range', min: field.min, max: field.max, step: field.step});
      input.dataset.field = field.key;
      input.setAttribute('aria-label', field.label);
      const number = document.createElement('input');
      Object.assign(number, {type: 'number', step: field.step, className: 'vr-number'});
      number.dataset.number = field.key;
      number.setAttribute('aria-label', `${field.group} ${field.axis} — точне значення`);
      if (field.group === 'scale') number.min = '0.01';
      const change = control => {
        const value = Number(control.value);
        if (control.value.trim() === '' || !Number.isFinite(value) || (field.group === 'scale' && value <= 0)) {
          control.setCustomValidity('Введи число' + (field.group === 'scale' ? ', більше нуля.' : '.'));
          return;
        }
        control.setCustomValidity('');
        stopJump(selected);
        stopAnimation(selected);
        const changed = {...current(field.group)};
        if (field.key === 'size') changed.x = changed.y = changed.z = value;
        else changed[field.axis] = value;
        selected.setAttribute(field.group, vector(changed));
        refresh();
      };
      input.addEventListener('input', () => change(input));
      number.addEventListener('input', () => change(number));
      label.querySelector('.vr-field-head').append(number);
      label.append(input);
      panel.querySelector(`[data-group="${field.group}"]`).append(label);
    }
    panel.addEventListener('keydown', event => event.stopPropagation());
    code.addEventListener('input', () => {
      if (!selected) return;
      drafts.set(selected.id, code.value);
      codeErrors.delete(selected.id);
      resizeCode();
      updateCodeMessage();
    });
    jsCode.addEventListener('input', () => { if (selected) { jsDrafts.set(selected.id, jsCode.value); resizeCode(); jsMessage.textContent = 'Зміни ще не застосовано.'; } });
    panel.querySelector('[data-js-apply]').addEventListener('click', () => {
      if (!selected) return;
      const el = selected;
      const staged = [];
      const originalAdd = el.addEventListener;
      el.addEventListener = function(type, listener, options) {
        if (!['click', 'mouseenter', 'mouseleave', 'vr-drag-start', 'vr-drag-end'].includes(type)) throw new Error('Вибери подію з довідки');
        if (typeof listener !== 'function') throw new Error('Обробник має бути функцією');
        staged.push({type, listener, options});
      };
      try {
        const make = new Function('jump', `"use strict";\n${jsCode.value}\n;return {cancelJump: typeof cancelJump === 'function' ? cancelJump : null, target: typeof figure === 'undefined' ? null : figure, onClick: typeof onClick === 'function' ? onClick : null, onMouseEnter: typeof onMouseEnter === 'function' ? onMouseEnter : null, onMouseLeave: typeof onMouseLeave === 'function' ? onMouseLeave : null, onDragStart: typeof onDragStart === 'function' ? onDragStart : null, onDragEnd: typeof onDragEnd === 'function' ? onDragEnd : null};`);
        const handler = make((height, duration) => jumpOnClick(el, height, duration));
        if (handler.target !== el) throw new Error('Селектор figure має вказувати на обрану фігуру');
        if (!staged.length && !['onClick', 'onMouseEnter', 'onMouseLeave', 'onDragStart', 'onDragEnd'].some(name => typeof handler[name] === 'function')) throw new Error('Додай функцію onClick, onMouseEnter, onMouseLeave, onDragStart або onDragEnd.');
        el.addEventListener = originalAdd;
        clearHandlers(el);
        handler.listeners = staged.map(({type, listener, options}) => {
          const wrapped = event => {
            try { listener.call(el, event); if (selected === el) refresh(); }
            catch (error) { jsMessage.textContent = 'Помилка ' + type + ': ' + error.message; }
          };
          originalAdd.call(el, type, wrapped, options);
          return {type, wrapped, options};
        });
        handlers.set(el.id, handler); jsDrafts.set(el.id, jsCode.value);
        jsMessage.textContent = 'Готово. Спробуй реакції цієї фігури у сцені.';
      } catch (error) { jsMessage.textContent = `Помилка: ${error.message}. Попередню реакцію збережено.`; }
      finally { el.addEventListener = originalAdd; }
    });
    panel.querySelector('[data-js-clear]').addEventListener('click', () => { if (!selected) return; clearHandlers(selected); jsDrafts.delete(selected.id); refresh(); });
    panel.querySelector('[data-js-editor]').addEventListener('toggle', resizeCode);
    window.addEventListener('resize', resizeCode);
    code.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        applyCode();
      }
    });
    panel.querySelector('[data-apply-code]').addEventListener('click', applyCode);
    panel.querySelector('[data-reset-camera]').addEventListener('click', () => {
      finishDrag();
      const look = cameraEl.components['look-controls'];
      if (look) {
        look.yawObject.rotation.y = initialCamera.yaw;
        look.pitchObject.rotation.x = initialCamera.pitch;
        look.mouseDown = false;
      }
      cameraEl.components['wasd-controls']?.velocity?.set(0, 0, 0);
      cameraEl.setAttribute('position', initialCamera.position);
      cameraEl.setAttribute('rotation', initialCamera.rotation);
    });
    colorInput.addEventListener('input', () => { selected.setAttribute('color', colorInput.value); refresh(); });
    panel.querySelector('[data-reset="one"]').addEventListener('click', () => { reset(selected); refresh(); });
    panel.querySelector('[data-reset="all"]').addEventListener('click', () => {
      finishDrag();
      hovered = null;
      for (const el of objects) { clearHandlers(el); el.remove(); }
      for (const el of pending) el.remove();
      pending.clear();
      drafts.clear();
      jsDrafts.clear();
      handlers.clear();
      codeErrors.clear();
      defaults.clear();
      animations.clear();
      objects = [];
      selected = null;
      setShadows(false);
      renderObjects();
      refresh();
      initialFigures.forEach(figure => mountFigure(figure, false));
    });
    panel.querySelector('[data-remove]').addEventListener('click', () => {
      if (!selected) return;
      finishDrag();
      stopJump(selected);
      if (hovered === selected) hovered = null;
      const index = objects.indexOf(selected);
      objects = objects.filter(el => el !== selected);
      defaults.delete(selected.id);
      drafts.delete(selected.id);
      jsDrafts.delete(selected.id);
      clearHandlers(selected);
      codeErrors.delete(selected.id);
      animations.delete(selected.id);
      selected.remove();
      selected = objects[Math.min(index, objects.length - 1)] ?? null;
      renderObjects();
      refresh();
    });
    panel.querySelector('[data-add]').addEventListener('click', addFigure);

    function remember(el) {
      const values = Object.fromEntries(['position', 'rotation', 'scale', 'color'].map(key => [key, key === 'color' ? el.getAttribute(key) : vector(el.getAttribute(key))]));
      for (const [key] of dimensions[kindOf(el)]) values[key] = dimensionValue(el, key);
      defaults.set(el.id, values);
    }
    function reset(el) {
      if (el) stopJump(el);
      if (!el) return;
      stopAnimation(el);
      drafts.delete(el.id);
      jsDrafts.delete(el.id);
      clearHandlers(el);
      codeErrors.delete(el.id);
      for (const [key, value] of Object.entries(defaults.get(el.id))) el.setAttribute(key, value);
      applyObjectShadow(el);
    }
    function renderObjects() {
      objectBar.replaceChildren();
      for (const el of objects) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = el.dataset.editorName;
        button.dataset.object = el.id;
        button.addEventListener('click', () => { selected = el; refresh(); });
        objectBar.append(button);
      }
    }
    function refresh() {
      panel.querySelectorAll('.vr-fields input, .vr-dimensions input, [data-color], .vr-code, [data-apply-code], [data-reset="one"], [data-remove], [data-animation-control], [data-js-code], [data-js-apply], [data-js-clear]')
        .forEach(control => { control.disabled = !selected; });
      shadowToggle.checked = shadowsEnabled;
      const motion = selected && animations.get(selected.id);
      animationKind.querySelector('[value="custom"]').hidden = motion?.kind !== 'custom';
      animationKind.value = motion?.kind ?? 'none';
      panel.querySelector('[data-stop-animation]').disabled = !motion;
      if (motion) {
        animationDuration.min = Math.min(1, motion.config.dur / 1000);
        animationDuration.max = Math.max(10, motion.config.dur / 1000);
        animationDuration.value = motion.config.dur / 1000;
      }
      panel.querySelector('[data-duration-label]').textContent = `${format(Number(animationDuration.value))} с`;
      outline.visible = Boolean(selected) && !clean;
      if (!selected) {
        geometryOwner = null;
        geometryBox.replaceChildren();
        panel.querySelectorAll('[data-number]').forEach(input => { input.value = ''; });
        jsCode.value = '';
        jsMessage.textContent = 'Додай фігуру, щоб налаштувати реакцію.';
        code.value = '';
        code.placeholder = 'Додай фігуру, щоб редагувати її HTML.';
        resizeCode();
        code.setAttribute('aria-invalid', 'false');
        codeMessage.textContent = 'Додай фігуру або натисни «Початкова сцена».';
        codeMessage.classList.remove('is-error');
        status.textContent = 'У сцені немає фігур.';
        return;
      }
      const jsValue = jsDrafts.get(selected.id) ?? starterJS(selected);
      if (jsCode.value !== jsValue) { jsCode.value = jsValue; resizeCode(); }
      jsMessage.textContent = handlers.has(selected.id) ? 'Реакцію застосовано до цієї фігури.' : 'Приклад ще не застосовано.';
      code.placeholder = '';
      for (const button of objectBar.querySelectorAll('button')) {
        button.setAttribute('aria-pressed', String(button.dataset.object === selected.id));
        button.style.setProperty('--swatch', document.getElementById(button.dataset.object).getAttribute('color'));
      }
      for (const field of fields) {
        const input = panel.querySelector(`[data-field="${field.key}"]`);
        const number = panel.querySelector(`[data-number="${field.key}"]`);
        const value = current(field.group)[field.axis];
        input.min = Math.min(field.min, value);
        input.max = Math.max(field.max, value);
        input.value = value;
        if (document.activeElement !== number) number.value = neat(value);
        number.setCustomValidity('');
        if (field.key === 'size') {
          const scale = current('scale');
          number.title = `Поточні x/y/z: ${[scale.x, scale.y, scale.z].map(format).join(' / ')}. Цей повзунок задає однаковий масштаб усіх осей.`;
        }
      }
      renderDimensions();
      colorInput.value = '#' + new THREE.Color(selected.getAttribute('color')).getHexString();
      const value = drafts.get(selected.id) ?? serialize(selected);
      if (code.value !== value) {
        code.value = value;
        resizeCode();
      }
      updateCodeMessage();
      status.textContent = `Обрано: ${selected.dataset.editorName}`;
      selected.object3D.updateMatrixWorld(true);
      outline.setFromObject(selected.object3D);
    }
    function renderDimensions() {
      if (geometryOwner !== selected) {
        geometryOwner = selected;
        geometryBox.replaceChildren();
        for (const [key, name] of dimensions[kindOf(selected)]) {
          const label = document.createElement('label');
          label.className = 'vr-dimension';
          const text = document.createElement('span');
          text.textContent = name;
          const number = document.createElement('input');
          Object.assign(number, {type: 'number', step: '0.05', min: key === 'radius-top' ? '0' : '0.01', className: 'vr-number'});
          number.dataset.dimension = key;
          number.setAttribute('aria-label', `${name} · метри`);
          number.addEventListener('input', () => {
            const value = Number(number.value);
            const min = key === 'radius-top' ? 0 : Number.EPSILON;
            if (number.value.trim() === '' || !Number.isFinite(value) || value < min) {
              number.setCustomValidity(key === 'radius-top' ? 'Введи число від нуля.' : 'Введи число, більше нуля.');
              return;
            }
            number.setCustomValidity('');
            selected.setAttribute(key, value);
            refresh();
          });
          label.append(text, number);
          geometryBox.append(label);
        }
      }
      for (const input of geometryBox.querySelectorAll('input')) {
        if (document.activeElement !== input) input.value = neat(dimensionValue(selected, input.dataset.dimension));
      }
    }
    function applyObjectShadow(el) {
      el.setAttribute('shadow', `cast: ${shadowsEnabled}; receive: ${shadowsEnabled}`);
    }
    function setShadows(enabled) {
      shadowsEnabled = enabled;
      sunLight.setAttribute('position', enabled ? '-3 7 1' : '-0.5 1 1');
      lightTarget.setAttribute('position', enabled ? '0 0 -4' : '0 0 0');
      sunLight.setAttribute('light', 'castShadow', enabled);
      sunLight.setAttribute('light', 'intensity', sunDefaults.intensity * (enabled ? 1.5 : 1));
      ambientLight.setAttribute('light', 'intensity', ambientDefaults.intensity * (enabled ? 0.5 : 1));
      objects.forEach(applyObjectShadow);
      scene.querySelectorAll('a-plane').forEach(el => el.setAttribute('shadow', `cast: false; receive: ${enabled}`));
      shadowToggle.checked = enabled;
    }
    function readPose(el) {
      return Object.fromEntries(['position', 'rotation', 'scale'].map(key => [key, {...el.getAttribute(key)}]));
    }
    function stopAnimation(el, restore = false) {
      const motion = animations.get(el.id);
      if (!motion) return;
      const pose = restore ? motion.base : readPose(el);
      el.removeAttribute('animation');
      animations.delete(el.id);
      for (const [key, value] of Object.entries(pose)) el.setAttribute(key, vector(value));
    }
    function stopJump(el) {
      handlers.get(el.id)?.cancelJump?.();
      const jump = jumps.get(el);
      if (!jump) return;
      jumps.delete(el);
      el.removeEventListener("animationcomplete__jump", jump.done);
      el.removeAttribute("animation__jump");
      el.setAttribute("position", vector(jump.position));
    }
    function clearHandlers(el) {
      stopJump(el);
      const handler = handlers.get(el.id);
      for (const item of handler?.listeners ?? []) el.removeEventListener(item.type, item.wrapped, item.options);
      handlers.delete(el.id);
    }
    function runHandler(el, name) {
      const type = {onClick: 'click', onMouseEnter: 'mouseenter', onMouseLeave: 'mouseleave', onDragStart: 'vr-drag-start', onDragEnd: 'vr-drag-end'}[name];
      const listeners = handlers.get(el.id)?.listeners;
      if (listeners?.length) {
        const handled = listeners.some(item => item.type === type);
        el.dispatchEvent(new CustomEvent(type, {detail: {figure: el}}));
        return handled;
      }
      const fn = handlers.get(el.id)?.[name];
      if (!fn) return false;
      try { fn(el); if (selected === el) refresh(); }
      catch (error) { jsMessage.textContent = `Помилка ${name}: ${error.message}`; }
      return true;
    }
    function jumpOnClick(el, height = 1, duration = 350) {
      if (!Number.isFinite(height) || !Number.isFinite(duration) || duration <= 0) throw new Error("jump: висота має бути числом, тривалість — додатним числом у мс");
      stopJump(el);
      stopAnimation(el);
      const position = {...el.getAttribute("position")};
      const done = () => { stopJump(el); if (selected === el) refresh(); };
      jumps.set(el, {position, done});
      el.addEventListener("animationcomplete__jump", done);
      el.setAttribute("animation__jump", `property: position; from: ${vector(position)}; to: ${vector({...position, y: position.y + height})}; dur: ${duration}; loop: 2; dir: alternate; easing: easeInOutSine`);
    }
    function startAnimation(el, kind, seconds, custom = null) {
      stopJump(el);
      stopAnimation(el, true);
      const base = readPose(el);
      let config;
      if (custom) {
        config = {...custom};
        config.from ??= vector(base[config.property]);
        const [x, y, z] = config.from.split(/\s+/).map(Number);
        base[config.property] = {x, y, z};
      } else if (kind === 'spin') {
        config = {property: 'rotation', from: vector(base.rotation), to: vector({...base.rotation, y: base.rotation.y + 360}), dur: seconds * 1000, loop: true, dir: 'normal', easing: 'linear'};
      } else if (kind === 'float') {
        config = {property: 'position', from: vector(base.position), to: vector({...base.position, y: base.position.y + 1}), dur: seconds * 1000, loop: true, dir: 'alternate', easing: 'easeInOutSine'};
      } else {
        config = {property: 'scale', from: vector(base.scale), to: vector(Object.fromEntries(Object.entries(base.scale).map(([axis, value]) => [axis, value * 1.25]))), dur: seconds * 1000, loop: true, dir: 'alternate', easing: 'easeInOutSine'};
      }
      el.setAttribute(config.property, vector(base[config.property]));
      animations.set(el.id, {kind, base, config});
      el.setAttribute('animation', animationText(config));
    }
    function animationText(config) {
      return Object.entries(config).map(([key, value]) => `${key}: ${value}`).join('; ');
    }
    function parseAnimation(text) {
      const config = {};
      const allowed = new Set(['property', 'from', 'to', 'dur', 'loop', 'dir', 'easing']);
      for (const part of text.split(';').filter(part => part.trim())) {
        const at = part.indexOf(':');
        const key = part.slice(0, at).trim();
        const value = part.slice(at + 1).trim();
        if (at < 0 || !allowed.has(key) || Object.hasOwn(config, key)) throw new Error('animation: використовуй property, from, to, dur, loop, dir та easing через крапку з комою.');
        config[key] = value;
      }
      if (!['position', 'rotation', 'scale'].includes(config.property)) throw new Error('animation property: вибери position, rotation або scale.');
      for (const key of ['from', 'to']) {
        if (key === 'from' && !Object.hasOwn(config, key)) continue;
        const parts = (config[key] ?? '').trim().split(/\s+/);
        const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
        if (parts.length !== 3 || !parts.every(p => numeric.test(p) && Number.isFinite(Number(p)))) throw new Error(`animation ${key}: потрібні три числа через пробіл.`);
        if (config.property === 'scale' && parts.some(p => Number(p) <= 0)) throw new Error('animation scale: усі множники мають бути більшими за нуль.');
        config[key] = parts.map(Number).join(' ');
      }
      config.dur = Number(config.dur ?? 4000);
      if (!Number.isFinite(config.dur) || config.dur <= 0) throw new Error('animation dur: потрібна додатна тривалість у мілісекундах.');
      config.loop ??= 'true';
      if (!['true', 'false'].includes(config.loop)) throw new Error('animation loop: введи true або false.');
      config.loop = config.loop === 'true';
      config.dir ??= 'normal';
      if (!['normal', 'reverse', 'alternate'].includes(config.dir)) throw new Error('animation dir: вибери normal, reverse або alternate.');
      config.easing ??= 'linear';
      if (!['linear', 'easeInOutSine', 'easeInOutQuad', 'easeInQuad', 'easeOutQuad'].includes(config.easing)) throw new Error('animation easing: вибери linear, easeInOutSine, easeInOutQuad, easeInQuad або easeOutQuad.');
      return config;
    }
    function parseShadow(text) {
      if (['true', 'false'].includes(text.trim())) return {cast: text.trim() === 'true', receive: text.trim() === 'true'};
      const result = {cast: true, receive: true};
      const seen = new Set();
      for (const part of text.split(';').filter(part => part.trim())) {
        const pair = part.trim().match(/^(cast|receive)\s*:\s*(true|false)$/);
        if (!pair || seen.has(pair[1])) throw new Error('shadow: використовуй cast: true/false; receive: true/false.');
        seen.add(pair[1]);
        result[pair[1]] = pair[2] === 'true';
      }
      return result;
    }
    function resizeCode() {
      if (!code.getClientRects().length) return;
      const scrollTop = panel.scrollTop;
      // Спочатку стискаємо поле, щоб воно могло також зменшуватися після видалення рядків.
      for (const editor of [code, jsCode]) {
        if (!editor.getClientRects().length) continue;
        editor.style.height = '0px';
        const frame = editor.offsetHeight - editor.clientHeight;
        editor.style.height = `${editor.scrollHeight + frame}px`;
      }
      panel.scrollTop = scrollTop;
    }
    function serialize(el) {
      const tag = el.tagName.toLowerCase();
      const motion = animations.get(el.id);
      const shadow = el.getAttribute('shadow');
      return [`<${tag}`,
        `  id="${el.id}"`,
        ...dimensions[kindOf(el)].map(([key]) => `  ${key}="${dimensionValue(el, key)}"`),
        ...['position', 'rotation', 'scale'].map(key => `  ${key}="${vector(motion?.base[key] ?? el.getAttribute(key))}"`),
        ...(shadow?.cast || shadow?.receive ? [`  shadow="cast: ${shadow.cast}; receive: ${shadow.receive}"`] : []),
        ...(motion ? [`  animation="${animationText(motion.config)}"`] : []),
        `  color="${el.getAttribute('color')}">`, `</${tag}>`].join('\n');
    }
    function updateCodeMessage() {
      const error = codeErrors.get(selected.id);
      const dirty = drafts.has(selected.id);
      codeMessage.textContent = error ?? (dirty ? 'Є незастосовані зміни HTML. Натисни «Застосувати», щоб оновити фігуру.' : 'Код відповідає обраній фігурі.');
      codeMessage.classList.toggle('is-error', Boolean(error));
      code.setAttribute('aria-invalid', String(Boolean(error)));
    }
    function applyCode() {
      if (selected) stopJump(selected);
      if (!selected) return;
      const text = code.value.trim();
      try {
        const doc = new DOMParser().parseFromString(text, 'application/xml');
        if (doc.querySelector('parsererror')) throw new Error('Перевір лапки, знаки < > та парний закривальний тег.');
        const root = doc.documentElement;
        if (root.tagName !== selected.tagName.toLowerCase()) throw new Error(`Зараз обрано <${selected.tagName.toLowerCase()}>. Для іншого типу додай нову фігуру.`);
        if (root.children.length || root.textContent.trim()) throw new Error('Тут редагуємо одну фігуру без вкладених тегів і тексту.');
        const allowed = new Set(['id', 'position', 'rotation', 'scale', 'color', 'animation', 'shadow', ...dimensions[kindOf(selected)].map(([key]) => key)]);
        const changes = [];
        let motionConfig = null;
        let shadowConfig = null;
        const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
        for (const attr of root.attributes) {
          const {name, value} = attr;
          if (!allowed.has(name)) throw new Error(`Параметр «${name}» тут не підтримується. Змінюй перетворення, колір, розміри, shadow або animation.`);
          if (name === 'id') {
            if (value !== selected.id) throw new Error('id змінити не можна: він пов’язує фігуру з її JS.');
          } else if (name === 'animation') {
            motionConfig = parseAnimation(value);
          } else if (name === 'shadow') {
            shadowConfig = parseShadow(value);
          } else if (['position', 'rotation', 'scale'].includes(name)) {
            const parts = value.trim().split(/\s+/);
            if (parts.length !== 3 || !parts.every(p => numeric.test(p) && Number.isFinite(Number(p)))) throw new Error(`${name}: потрібні три числа через пробіл. Дроби записуй через крапку, наприклад 0.5.`);
            if (name === 'scale' && parts.some(p => Number(p) <= 0)) throw new Error('scale: усі три множники мають бути більшими за нуль.');
            changes.push([name, parts.map(Number).join(' ')]);
          } else if (name === 'color') {
            const color = value.trim();
            if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color) && !Object.hasOwn(THREE.Color.NAMES, color.toLowerCase())) throw new Error('color: введи #RRGGBB, #RGB або назву кольору, наприклад red.');
            changes.push([name, '#' + new THREE.Color(color).getHexString()]);
          } else {
            const number = Number(value);
            if (!numeric.test(value.trim()) || !Number.isFinite(number) || (name === 'radius-top' ? number < 0 : number <= 0)) throw new Error(`${name}: потрібне ${name === 'radius-top' ? 'невід’ємне' : 'додатне'} число. Дроби записуй через крапку.`);
            changes.push([name, number]);
          }
        }
        // Спершу перевіряємо весь фрагмент, потім застосовуємо зміни разом.
        stopAnimation(selected);
        for (const [name, value] of changes) selected.setAttribute(name, value);
        if (shadowConfig) selected.setAttribute('shadow', `cast: ${shadowConfig.cast}; receive: ${shadowConfig.receive}`);
        if (motionConfig) startAnimation(selected, 'custom', motionConfig.dur / 1000, motionConfig);
        drafts.delete(selected.id);
        codeErrors.delete(selected.id);
        refresh();
        codeMessage.textContent = 'Зміни застосовано до сцени.';
      } catch (error) {
        drafts.set(selected.id, code.value);
        codeErrors.set(selected.id, error.message);
        updateCodeMessage();
      }
    }
    function addFigure() {
      const kind = panel.querySelector('[data-add-kind]').value;
      const figure = figures[kind];
      const candidates = [-3.2, -4.7, -6.3, -7.5].flatMap(z => [-1.5, 1.5, -3.2, 0, 3.2].map(x => ({x, z})));
      const place = candidates.find(p => objects.every(el => {
        const q = el.getAttribute('position');
        return Math.hypot(q.x - p.x, q.z - p.z) > 1.3;
      })) ?? {x: 0, z: -3};
      const id = nextId++;
      mountFigure({
        tag: `a-${kind}`, id: `editor-${kind}-${id}`, name: `${figure.name} ${id}`,
        attributes: {position: `${place.x} ${figure.y} ${place.z}`, rotation: '0 0 0', scale: '1 1 1', color: figure.color, ...figure.attrs},
      });
    }
    function mountFigure(figure, selectOnLoad = true) {
      const el = document.createElement(figure.tag);
      el.id = figure.id;
      el.dataset.editorName = figure.name;
      for (const [key, value] of Object.entries(figure.attributes)) el.setAttribute(key, value);
      el.addEventListener('loaded', () => {
        pending.delete(el);
        // Сцену могли скинути, поки A-Frame готував нову геометрію.
        if (!el.isConnected) return;
        objects.push(el);
        remember(el);
        applyObjectShadow(el);
        if (selectOnLoad || !selected) selected = el;
        renderObjects();
        refresh();
      }, {once: true});
      pending.add(el);
      scene.append(el);
    }

    // Промінь із камери знаходить фігуру, а горизонтальна площина зберігає її y.
    const canvas = scene.canvas;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const hitPoint = new THREE.Vector3();
    const dragPlane = new THREE.Plane();
    function cast(event) {
      const rect = canvas.getBoundingClientRect();
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      scene.object3D.updateMatrixWorld(true);
      raycaster.setFromCamera(pointer, scene.camera);
    }
    function pick() {
      const hit = raycaster.intersectObjects(objects.map(el => el.object3D), true)[0];
      if (!hit) return null;
      let node = hit.object;
      while (node) {
        const el = objects.find(el => el.object3D === node);
        if (el) return el;
        node = node.parent;
      }
      return null;
    }
    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0 || drag) return;
      cast(event);
      const el = pick();
      if (!el) return;
      stopJump(el);
      stopAnimation(el);
      selected = el;
      refresh();
      const start = {...el.getAttribute('position')};
      dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(start.x, start.y, start.z));
      const point = raycaster.ray.intersectPlane(dragPlane, hitPoint);
      if (!point) return;
      const look = scene.camera.el?.components['look-controls'];
      drag = {id: event.pointerId, el, start, clientX: event.clientX, clientY: event.clientY, moved: false, offset: new THREE.Vector3(start.x, start.y, start.z).sub(point), look, lookEnabled: look?.data.enabled};
      if (look) look.el.setAttribute('look-controls', 'enabled', false);
      canvas.setPointerCapture(event.pointerId);
      canvas.style.cursor = 'grabbing';
      event.preventDefault();
      event.stopImmediatePropagation();
    }, {capture: true});
    canvas.addEventListener('pointermove', event => {
      cast(event);
      if (!drag) { const next = pick(); canvas.style.cursor = next ? 'grab' : ''; if (next !== hovered) { if (hovered) runHandler(hovered, 'onMouseLeave'); hovered = next; if (hovered) runHandler(hovered, 'onMouseEnter'); } return; }
      if (event.pointerId !== drag.id) return;
      if (Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY) < 5 && !drag.moved) return;
      if (!drag.moved) runHandler(drag.el, 'onDragStart');
      drag.moved = true;
      const point = raycaster.ray.intersectPlane(dragPlane, hitPoint);
      if (point) {
        point.add(drag.offset);
        const x = round(Math.round(Math.max(-5, Math.min(5, point.x)) * 20) / 20);
        const z = round(Math.round(Math.max(-8, Math.min(8, point.z)) * 20) / 20);
        drag.el.setAttribute('position', `${x} ${drag.start.y} ${z}`);
        refresh();
      }
      event.preventDefault();
      event.stopImmediatePropagation();
    }, {capture: true});
    canvas.addEventListener('pointerup', event => {
      if (!drag || event.pointerId !== drag.id) return;
      const clicked = !drag.moved ? drag.el : null;
      const moved = drag.moved ? drag.el : null;
      finishDrag();
      if (moved) runHandler(moved, 'onDragEnd');
      if (clicked && !runHandler(clicked, 'onClick') && jumpToggle.checked) jumpOnClick(clicked);
      event.preventDefault();
      event.stopImmediatePropagation();
    }, {capture: true});
    canvas.addEventListener('pointerleave', () => { if (!drag && hovered) { runHandler(hovered, 'onMouseLeave'); hovered = null; } });
    canvas.addEventListener('pointercancel', () => finishDrag(true));
    canvas.addEventListener('lostpointercapture', () => finishDrag());
    window.addEventListener('blur', () => finishDrag());
    window.addEventListener('keydown', event => { if (event.key === 'Escape') finishDrag(true); });
    function finishDrag(cancel = false) {
      if (!drag) return;
      const previous = drag;
      drag = null;
      if (cancel) previous.el.setAttribute('position', vector(previous.start));
      if (previous.look) previous.look.el.setAttribute('look-controls', 'enabled', previous.lookEnabled);
      if (canvas.hasPointerCapture(previous.id)) canvas.releasePointerCapture(previous.id);
      canvas.style.cursor = '';
      refresh();
    }
    renderObjects();
    refresh();
  }
})();
