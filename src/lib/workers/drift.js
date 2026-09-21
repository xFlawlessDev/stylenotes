let t = 0;

function tick() {
  t += 0.0016;
  const y1 = 22 + Math.sin(t * 1.1) * 9;
  const x1 = 18 + Math.cos(t * 0.8) * 10;
  const y2 = 78 - Math.cos(t * 0.9) * 9;
  const x2 = 82 + Math.sin(t * 0.7) * 10;
  const y3 = 62 + Math.sin(t * 1.4 + 1.2) * 8;
  const x3 = 46 + Math.cos(t * 0.6 + 0.4) * 12;

  self.postMessage({
    aurora: `radial-gradient(42% 48% at ${x1.toFixed(2)}% ${y1.toFixed(2)}%, rgba(168,199,232,0.1), transparent 70%), radial-gradient(38% 42% at ${x2.toFixed(2)}% ${y2.toFixed(2)}%, rgba(143,166,189,0.08), transparent 70%), radial-gradient(46% 44% at ${x3.toFixed(2)}% ${y3.toFixed(2)}%, rgba(158,201,196,0.06), transparent 72%)`,
  });

  setTimeout(tick, 90);
}

tick();