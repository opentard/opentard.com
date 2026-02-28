(function () {
  var canvas = document.getElementById('tardigrade-canvas');
  if (!canvas) return;

  var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  if (!gl) {
    // Fallback to static SVG
    canvas.style.display = 'none';
    var img = document.createElement('img');
    img.src = 'img/tardigrade.svg';
    img.alt = 'OpenTard mascot';
    img.className = 'hero-mascot';
    canvas.parentNode.insertBefore(img, canvas);
    return;
  }

  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var rect = canvas.getBoundingClientRect();
  var displayW = rect.width > 0 ? rect.width : 340;
  var displayH = rect.height > 0 ? rect.height : 340;
  canvas.width = Math.round(displayW * dpr);
  canvas.height = Math.round(displayH * dpr);

  // --- Shaders ---
  var vertSrc = [
    'attribute vec2 a_pos;',
    'void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }'
  ].join('\n');

  var fragSrc = [
    'precision highp float;',
    'uniform float u_time;',
    'uniform vec2 u_res;',
    '',
    'float sdEllipsoid(vec3 p, vec3 r) {',
    '  float k0 = length(p / r);',
    '  float k1 = length(p / (r * r));',
    '  return k0 * (k0 - 1.0) / max(k1, 0.0001);',
    '}',
    '',
    'float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {',
    '  vec3 pa = p - a, ba = b - a;',
    '  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);',
    '  return length(pa - ba * h) - r;',
    '}',
    '',
    'float sdSphere(vec3 p, float r) { return length(p) - r; }',
    '',
    'float smin(float a, float b, float k) {',
    '  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);',
    '  return mix(b, a, h) - k * h * (1.0 - h);',
    '}',
    '',
    'mat3 rotY(float a) {',
    '  float c = cos(a), s = sin(a);',
    '  return mat3(c,0,-s, 0,1,0, s,0,c);',
    '}',
    'mat3 rotX(float a) {',
    '  float c = cos(a), s = sin(a);',
    '  return mat3(1,0,0, 0,c,-s, 0,s,c);',
    '}',
    '',
    'vec2 mapBody(vec3 p) {',
    '  float t = u_time;',
    '  float headBob = sin(t * 0.8) * 0.07 - 0.02;',
    '  float wave = sin(t * 0.5) * 0.015;',
    '  float br = 1.0 + sin(t * 0.4) * 0.015;',
    '',
    '  // Body segments (4 plump ellipsoids)',
    '  float body = sdEllipsoid(p - vec3(0.0, wave, 0.0), vec3(0.32, 0.22*br, 0.22*br));',
    '  body = smin(body, sdEllipsoid(p - vec3(0.33, wave*0.7, 0.0), vec3(0.30, 0.24*br, 0.24*br)), 0.15);',
    '  body = smin(body, sdEllipsoid(p - vec3(-0.28, wave*1.2, 0.0), vec3(0.26, 0.20*br, 0.20*br)), 0.14);',
    '  body = smin(body, sdEllipsoid(p - vec3(0.62, wave*0.3, 0.0), vec3(0.22, 0.18*br, 0.18*br)), 0.12);',
    '',
    '  // Segment creases (subtle indentations)',
    '  float crease1 = length(p.xz - vec2(0.16, 0.0)) - 0.01;',
    '  float crease2 = length(p.xz - vec2(-0.14, 0.0)) - 0.01;',
    '  float crease3 = length(p.xz - vec2(0.48, 0.0)) - 0.01;',
    '',
    '  // Head',
    '  vec3 hp = vec3(-0.55, 0.05 + headBob, 0.0);',
    '  float head = sdEllipsoid(p - hp, vec3(0.17, 0.13, 0.13));',
    '  body = smin(body, head, 0.1);',
    '',
    '  // Mouth / pharynx tube',
    '  vec3 mp = hp + vec3(-0.16, headBob * 0.3 - 0.02, 0.0);',
    '  body = smin(body, sdEllipsoid(p - mp, vec3(0.08, 0.05, 0.05)), 0.05);',
    '',
    '  // Stylet tips (two tiny prongs at mouth)',
    '  vec3 st1 = mp + vec3(-0.07, 0.02, -0.02);',
    '  vec3 st2 = mp + vec3(-0.07, 0.02, 0.02);',
    '  body = smin(body, sdCapsule(p, mp, st1, 0.012), 0.02);',
    '  body = smin(body, sdCapsule(p, mp, st2, 0.012), 0.02);',
    '',
    '  // 4 pairs of legs (8 total)',
    '  float legs = 1e10;',
    '  for (int i = 0; i < 4; i++) {',
    '    float fi = float(i);',
    '    float xp = -0.12 + fi * 0.25;',
    '    float phase = t * 0.7 + fi * 1.57;',
    '    float ly = sin(phase) * 0.025;',
    '    float lx = cos(phase) * 0.015;',
    '',
    '    // Left leg + foot (claw)',
    '    vec3 aL = vec3(xp, -0.13, -0.16);',
    '    vec3 mL = vec3(xp + lx * 0.5, -0.24 + ly * 0.5, -0.22);',
    '    vec3 fL = vec3(xp + lx, -0.33 + ly, -0.27);',
    '    legs = min(legs, sdCapsule(p, aL, mL, 0.035));',
    '    legs = min(legs, sdCapsule(p, mL, fL, 0.028));',
    '    legs = smin(legs, sdSphere(p - fL, 0.038), 0.018);',
    '',
    '    // Right leg + foot (claw)',
    '    vec3 aR = vec3(xp, -0.13, 0.16);',
    '    vec3 mR = vec3(xp + lx * 0.5, -0.24 + ly * 0.5, 0.22);',
    '    vec3 fR = vec3(xp + lx, -0.33 + ly, 0.27);',
    '    legs = min(legs, sdCapsule(p, aR, mR, 0.035));',
    '    legs = min(legs, sdCapsule(p, mR, fR, 0.028));',
    '    legs = smin(legs, sdSphere(p - fR, 0.038), 0.018);',
    '  }',
    '  body = smin(body, legs, 0.05);',
    '',
    '  // Eyes (two dark spheres on head)',
    '  vec3 eL = hp + vec3(-0.07, 0.08, -0.07);',
    '  vec3 eR = hp + vec3(-0.07, 0.08, 0.07);',
    '  float eyes = min(sdSphere(p - eL, 0.03), sdSphere(p - eR, 0.03));',
    '',
    '  // material: 0 = body, 1 = eye',
    '  if (eyes < body) return vec2(eyes, 1.0);',
    '  return vec2(body, 0.0);',
    '}',
    '',
    'vec2 map(vec3 p) {',
    '  vec3 center = vec3(0.05, -0.04, 0.0);',
    '  p -= center;',
    '  p = rotY(u_time * 0.2) * rotX(0.2) * p;',
    '  p += center;',
    '  return mapBody(p);',
    '}',
    '',
    'vec3 calcNormal(vec3 p) {',
    '  vec2 e = vec2(0.001, 0.0);',
    '  float d = map(p).x;',
    '  return normalize(vec3(',
    '    map(p + e.xyy).x - d,',
    '    map(p + e.yxy).x - d,',
    '    map(p + e.yyx).x - d',
    '  ));',
    '}',
    '',
    'float calcAO(vec3 p, vec3 n) {',
    '  float ao = 0.0; float s = 1.0;',
    '  for (int i = 1; i < 6; i++) {',
    '    float d = 0.01 + 0.05 * float(i);',
    '    ao += (d - map(p + n * d).x) * s;',
    '    s *= 0.5;',
    '  }',
    '  return clamp(1.0 - ao * 3.0, 0.0, 1.0);',
    '}',
    '',
    'float calcShadow(vec3 p, vec3 l) {',
    '  float res = 1.0; float t = 0.02;',
    '  for (int i = 0; i < 24; i++) {',
    '    float d = map(p + l * t).x;',
    '    res = min(res, 8.0 * d / t);',
    '    t += clamp(d, 0.01, 0.1);',
    '    if (d < 0.001 || t > 2.0) break;',
    '  }',
    '  return clamp(res, 0.0, 1.0);',
    '}',
    '',
    'void main() {',
    '  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);',
    '',
    '  vec3 ro = vec3(0.05, -0.04, 2.0);',
    '  vec3 rd = normalize(vec3(uv, -1.0));',
    '',
    '  // Raymarch',
    '  float t = 0.0;',
    '  vec2 h;',
    '  for (int i = 0; i < 80; i++) {',
    '    h = map(ro + rd * t);',
    '    if (abs(h.x) < 0.0005 || t > 8.0) break;',
    '    t += h.x * 0.85;',
    '  }',
    '',
    '  if (t < 8.0) {',
    '    vec3 p = ro + rd * t;',
    '    vec3 n = calcNormal(p);',
    '    float ao = calcAO(p, n);',
    '',
    '    // Two-light setup',
    '    vec3 l1 = normalize(vec3(0.5, 0.8, 0.6));',
    '    vec3 l2 = normalize(vec3(-0.4, 0.3, -0.5));',
    '    float d1 = max(dot(n, l1), 0.0);',
    '    float d2 = max(dot(n, l2), 0.0);',
    '    float sh = calcShadow(p + n * 0.005, l1);',
    '',
    '    // Specular (Blinn-Phong)',
    '    vec3 hv = normalize(l1 - rd);',
    '    float sp = pow(max(dot(n, hv), 0.0), 64.0);',
    '    vec3 hv2 = normalize(l2 - rd);',
    '    float sp2 = pow(max(dot(n, hv2), 0.0), 32.0);',
    '',
    '    // Subsurface scattering approx',
    '    float sss = pow(clamp(dot(rd, l1) * 0.5 + 0.5, 0.0, 1.0), 3.0) * 0.2;',
    '',
    '    // Fresnel rim',
    '    float rim = pow(1.0 - max(dot(-rd, n), 0.0), 3.5);',
    '',
    '    vec3 col;',
    '    if (h.y > 0.5) {',
    '      // Eyes: dark glossy',
    '      col = vec3(0.01, 0.01, 0.02);',
    '      sp *= 3.0;',
    '    } else {',
    '      // Body: translucent teal with depth variation',
    '      col = vec3(0.0, 0.5, 0.27);',
    '      // Add subtle warm undertone in thicker areas',
    '      col += vec3(0.02, 0.04, 0.0) * (1.0 - rim);',
    '    }',
    '',
    '    vec3 rimCol = vec3(0.0, 1.0, 0.533);',
    '    vec3 specCol = vec3(0.7, 1.0, 0.85);',
    '',
    '    vec3 c = col * (0.2 + d1 * 0.55 * sh + d2 * 0.18) * ao;',
    '    c += sp * 0.35 * specCol * sh;',
    '    c += sp2 * 0.08 * specCol;',
    '    c += sss * col * 1.2;',
    '    c += rim * rimCol * 0.3;',
    '',
    '    // Reinhard tone map',
    '    c = c / (c + vec3(1.0));',
    '',
    '    // Slight vignette on the tardigrade for depth',
    '    float vig = 1.0 - dot(uv, uv) * 0.3;',
    '    c *= vig;',
    '',
    '    gl_FragColor = vec4(c, 1.0);',
    '  } else {',
    '    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);',
    '  }',
    '}'
  ].join('\n');

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  var vs = compile(gl.VERTEX_SHADER, vertSrc);
  var fs = compile(gl.FRAGMENT_SHADER, fragSrc);
  if (!vs || !fs) return;

  var prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(prog));
    return;
  }
  gl.useProgram(prog);

  // Fullscreen quad
  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 1, -1, -1, 1,
    -1, 1, 1, -1, 1, 1
  ]), gl.STATIC_DRAW);

  var aPos = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  var uTime = gl.getUniformLocation(prog, 'u_time');
  var uRes = gl.getUniformLocation(prog, 'u_res');

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  var startTime = performance.now();

  function render() {
    var t = (performance.now() - startTime) * 0.001;

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.uniform1f(uTime, t);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    requestAnimationFrame(render);
  }

  render();
})();
