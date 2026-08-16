(function () {
  const canvas = document.getElementById('webgl-canvas');
  if (!canvas) return;

  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  if (!gl) return;

  const isMobile = window.innerWidth < 768;
  let PARTICLE_COUNT = isMobile ? 40 : 100;
  let scrollY = 0;
  let width = window.innerWidth;
  let height = window.innerHeight;

  canvas.width = width;
  canvas.height = height;

  // Shaders
  const vertSrc = `
    attribute vec2 a_position;
    attribute float a_size;
    attribute float a_alpha;
    uniform vec2 u_resolution;
    varying float v_alpha;
    void main() {
      vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
      clip.y = -clip.y;
      gl_Position = vec4(clip, 0.0, 1.0);
      gl_PointSize = a_size;
      v_alpha = a_alpha;
    }
  `;

  const fragSrc = `
    precision mediump float;
    varying float v_alpha;
    void main() {
      float d = distance(gl_PointCoord, vec2(0.5));
      if (d > 0.5) discard;
      float fade = 1.0 - smoothstep(0.2, 0.5, d);
      gl_FragColor = vec4(0.0, 1.0, 0.533, v_alpha * fade);
    }
  `;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  }

  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vertSrc));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragSrc));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  const aPos = gl.getAttribLocation(prog, 'a_position');
  const aSize = gl.getAttribLocation(prog, 'a_size');
  const aAlpha = gl.getAttribLocation(prog, 'a_alpha');
  const uRes = gl.getUniformLocation(prog, 'u_resolution');

  // Particles
  const particles = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.2,
      size: Math.random() * 3 + 1.5,
      alpha: Math.random() * 0.4 + 0.1
    });
  }

  const posBuf = gl.createBuffer();
  const sizeBuf = gl.createBuffer();
  const alphaBuf = gl.createBuffer();

  // Line drawing (constellation)
  const lineVertSrc = `
    attribute vec2 a_position;
    uniform vec2 u_resolution;
    void main() {
      vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
      clip.y = -clip.y;
      gl_Position = vec4(clip, 0.0, 1.0);
    }
  `;
  const lineFragSrc = `
    precision mediump float;
    uniform float u_alpha;
    void main() {
      gl_FragColor = vec4(0.0, 1.0, 0.533, u_alpha);
    }
  `;

  const lineProg = gl.createProgram();
  gl.attachShader(lineProg, compile(gl.VERTEX_SHADER, lineVertSrc));
  gl.attachShader(lineProg, compile(gl.FRAGMENT_SHADER, lineFragSrc));
  gl.linkProgram(lineProg);

  const lineAPos = gl.getAttribLocation(lineProg, 'a_position');
  const lineURes = gl.getUniformLocation(lineProg, 'u_resolution');
  const lineUAlpha = gl.getUniformLocation(lineProg, 'u_alpha');
  const lineBuf = gl.createBuffer();

  const CONNECTION_DIST = isMobile ? 100 : 150;

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  window.addEventListener('scroll', function () {
    scrollY = window.pageYOffset;
  }, { passive: true });

  window.addEventListener('resize', function () {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
  });

  function animate() {
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const drift = scrollY * 0.05;
    const posArr = new Float32Array(PARTICLE_COUNT * 2);
    const sizeArr = new Float32Array(PARTICLE_COUNT);
    const alphaArr = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = width;
      if (p.x > width) p.x = 0;
      if (p.y < 0) p.y = height;
      if (p.y > height) p.y = 0;

      posArr[i * 2] = p.x;
      posArr[i * 2 + 1] = ((p.y + drift) % height + height) % height;
      sizeArr[i] = p.size;
      alphaArr[i] = p.alpha;
    }

    // Draw lines
    const lineVerts = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      for (let j = i + 1; j < PARTICLE_COUNT; j++) {
        const dx = posArr[i * 2] - posArr[j * 2];
        const dy = posArr[i * 2 + 1] - posArr[j * 2 + 1];
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < CONNECTION_DIST) {
          lineVerts.push(posArr[i * 2], posArr[i * 2 + 1]);
          lineVerts.push(posArr[j * 2], posArr[j * 2 + 1]);
        }
      }
    }

    if (lineVerts.length > 0) {
      gl.useProgram(lineProg);
      gl.uniform2f(lineURes, width, height);
      gl.uniform1f(lineUAlpha, 0.06);
      gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lineVerts), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(lineAPos);
      gl.vertexAttribPointer(lineAPos, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.LINES, 0, lineVerts.length / 2);
      gl.disableVertexAttribArray(lineAPos);
    }

    // Draw particles
    gl.useProgram(prog);
    gl.uniform2f(uRes, width, height);

    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, posArr, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuf);
    gl.bufferData(gl.ARRAY_BUFFER, sizeArr, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(aSize);
    gl.vertexAttribPointer(aSize, 1, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, alphaBuf);
    gl.bufferData(gl.ARRAY_BUFFER, alphaArr, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(aAlpha);
    gl.vertexAttribPointer(aAlpha, 1, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.POINTS, 0, PARTICLE_COUNT);

    // Reduced motion: render the field once and leave it still. Also stop the loop while the tab
    // is hidden — rAF is throttled but not guaranteed to stop, and this is a GPU-backed loop.
    if (!reduceMotion && !document.hidden) {
      requestAnimationFrame(animate);
    } else {
      running = false;
    }
  }

  const reduceMotionQuery = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;
  let reduceMotion = reduceMotionQuery ? reduceMotionQuery.matches : false;

  // A hidden document still holds the frame callback queued by the last visible frame. Restarting
  // on visibilitychange without this guard leaves that pending callback *and* the new one running,
  // so every hide/show cycle adds another concurrent chain.
  let running = false;

  function start() {
    if (running || reduceMotion || document.hidden) return;
    running = true;
    requestAnimationFrame(animate);
  }

  if (reduceMotionQuery && reduceMotionQuery.addEventListener) {
    reduceMotionQuery.addEventListener('change', function (e) {
      reduceMotion = e.matches;
      start();
    });
  }

  document.addEventListener('visibilitychange', start);

  running = true;
  animate();
})();
