const COLORS = {
  paper: "#f7ecdf",
  chrome: "#efe4d5",
  ink: "#25231f",
  blue: "#7fcad6",
  green: "#88b77b",
  coral: "#ef7954",
  yellow: "#f3c550",
  violet: "#806edb",
  pink: "#e9a9bd",
};

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function pill(context, x, y, width, height, color, label = "") {
  context.fillStyle = color;
  roundedRect(context, x, y, width, height, height / 2);
  context.fill();
  if (!label) return;
  context.fillStyle = COLORS.ink;
  context.font = "600 18px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, x + width / 2, y + height / 2 + 1);
}

function drawBrowserChrome(context, x, y, width) {
  context.fillStyle = COLORS.chrome;
  roundedRect(context, x, y, width, 96, 26);
  context.fill();

  for (let index = 0; index < 3; index += 1) {
    context.fillStyle = [COLORS.coral, COLORS.yellow, COLORS.green][index];
    context.beginPath();
    context.arc(x + 28 + index * 24, y + 28, 8, 0, Math.PI * 2);
    context.fill();
  }

  context.fillStyle = "rgba(255,255,255,.72)";
  roundedRect(context, x + 190, y + 16, width - 380, 38, 19);
  context.fill();
  context.fillStyle = "rgba(37,35,31,.42)";
  context.font = "500 15px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("clay://live-canvas", x + width / 2, y + 35);

  pill(context, x + 26, y + 64, 165, 25, "rgba(255,255,255,.62)", "MAP ROOM");
  pill(context, x + 205, y + 64, 155, 25, "rgba(255,255,255,.42)", "GALLERY");
  pill(context, x + width - 168, y + 64, 142, 25, "rgba(255,255,255,.42)", "COLLECTION");
}

function drawMap(context, x, y, width, height, time) {
  context.fillStyle = "#b9dfe4";
  context.fillRect(x, y, width, height);
  const panX = time * 88;
  const panY = time * 34;
  const zoom = 1 + time * 0.012;

  context.save();
  context.translate(x + width / 2, y + height / 2);
  context.scale(zoom, zoom);
  context.translate(-x - width / 2 - panX, -y - height / 2 - panY);
  context.fillStyle = "#b9dfe4";
  context.fillRect(x - 300, y - 300, width + 1600, height + 900);

  context.strokeStyle = "rgba(255,255,255,.82)";
  context.lineWidth = 15;
  for (let row = -4; row < 15; row += 1) {
    context.beginPath();
    context.moveTo(x - 280, y + row * 108);
    context.bezierCurveTo(
      x + width * 0.3,
      y + row * 96 + 35,
      x + width * 0.72,
      y + row * 118 - 20,
      x + width + 1300,
      y + row * 102 + 28,
    );
    context.stroke();
  }

  context.strokeStyle = "rgba(74,91,99,.46)";
  context.lineWidth = 5;
  for (let column = -3; column < 18; column += 1) {
    context.beginPath();
    context.moveTo(x + column * 116, y - 300);
    context.lineTo(x + column * 104 - 80, y + height + 900);
    context.stroke();
  }

  const blocks = [
    [80, 80, 180, 150, COLORS.pink],
    [310, 55, 220, 190, "#ebc7a6"],
    [590, 120, 250, 165, "#d8b7a5"],
    [150, 390, 250, 220, "#cdb6df"],
    [500, 360, 300, 250, "#e6b2a4"],
    [900, 70, 235, 205, COLORS.yellow],
    [1190, 330, 310, 240, COLORS.green],
    [870, 560, 270, 210, COLORS.violet],
    [1450, 90, 250, 190, COLORS.blue],
  ];
  for (const [bx, by, bw, bh, color] of blocks) {
    context.fillStyle = color;
    roundedRect(context, x + bx, y + by, bw, bh, 22);
    context.fill();
  }

  const markers = [
    [185, 210, COLORS.yellow],
    [430, 330, COLORS.coral],
    [710, 250, COLORS.violet],
    [780, 560, COLORS.green],
    [1030, 190, COLORS.blue],
    [1260, 470, COLORS.coral],
    [1540, 260, COLORS.yellow],
  ];
  for (const [mx, my, color] of markers) {
    context.fillStyle = color;
    context.beginPath();
    context.arc(x + mx, y + my, 20, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "rgba(37,35,31,.3)";
    context.lineWidth = 3;
    context.stroke();
  }
  context.restore();

  pill(context, x + 28, y + 28, 270, 48, "rgba(255,255,255,.88)", "Search the handmade city");
}

function drawGallery(context, x, y, width, height, time) {
  context.fillStyle = "#f5eee3";
  context.fillRect(x, y, width, height);
  const scroll = time * 172;
  const cards = [
    [COLORS.coral, COLORS.violet, "COLOR STUDY"],
    [COLORS.violet, COLORS.green, "SOFT FORMS"],
    [COLORS.yellow, COLORS.blue, "CITY OBJECTS"],
    [COLORS.green, COLORS.pink, "PLAYFUL TYPE"],
    [COLORS.blue, COLORS.coral, "TINY WORLDS"],
    [COLORS.pink, COLORS.yellow, "MATERIAL LAB"],
    ["#78b9a9", COLORS.violet, "OBJECT GARDEN"],
    ["#d7a46d", COLORS.blue, "PLAYGROUND"],
    ["#8b7bd8", COLORS.yellow, "TINY MACHINES"],
    ["#e28b73", COLORS.green, "NEW SHAPES"],
    ["#81b9d0", COLORS.coral, "SOFT SYSTEMS"],
    ["#a5bd75", COLORS.pink, "LAST COLLECTION"],
  ];

  cards.forEach(([background, accent, label], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const cardWidth = (width - 82) / 2;
    const cardHeight = 270;
    const cardX = x + 28 + column * (cardWidth + 26);
    const cardY = y + 28 + row * (cardHeight + 28) - scroll;
    context.fillStyle = background;
    roundedRect(context, cardX, cardY, cardWidth, cardHeight, 26);
    context.fill();

    context.fillStyle = accent;
    context.beginPath();
    context.arc(cardX + cardWidth * 0.34, cardY + 112, 64, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "rgba(255,255,255,.68)";
    roundedRect(context, cardX + cardWidth * 0.48, cardY + 58, cardWidth * 0.36, 112, 38);
    context.fill();
    context.fillStyle = COLORS.ink;
    context.font = "700 20px system-ui, sans-serif";
    context.textAlign = "left";
    context.fillText(label, cardX + 24, cardY + cardHeight - 35);
  });

  context.fillStyle = "rgba(37,35,31,.16)";
  roundedRect(context, x + width - 15, y + 22, 6, height - 44, 3);
  context.fill();
  const thumbTravel = height - 150;
  const thumbY = y + 24 + Math.min(1, time / 7.5) * thumbTravel;
  context.fillStyle = "rgba(37,35,31,.56)";
  roundedRect(context, x + width - 17, thumbY, 10, 104, 5);
  context.fill();
}

export function startDemoSource(canvas) {
  const context = canvas.getContext("2d");
  const startedAt = performance.now();
  let animation = null;
  let stopped = false;

  const draw = (timestamp) => {
    if (stopped) return;
    const elapsed = (timestamp - startedAt) / 1000;
    const cycle = elapsed % 14;
    const x = 84;
    const y = 104;
    const width = canvas.width - x * 2;
    const height = canvas.height - 208;

    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "#dcc9ba");
    gradient.addColorStop(1, "#cbb7a7");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.save();
    context.shadowColor = "rgba(62,40,25,.22)";
    context.shadowBlur = 38;
    context.shadowOffsetY = 22;
    context.fillStyle = COLORS.paper;
    roundedRect(context, x, y, width, height, 30);
    context.fill();
    context.restore();

    drawBrowserChrome(context, x, y, width);
    context.save();
    roundedRect(context, x, y + 96, width, height - 96, 25);
    context.clip();
    if (cycle < 6.5) drawMap(context, x, y + 96, width, height - 96, cycle);
    else drawGallery(context, x, y + 96, width, height - 96, cycle - 6.5);
    context.restore();

    animation = requestAnimationFrame(draw);
  };

  animation = requestAnimationFrame(draw);
  return () => {
    stopped = true;
    if (animation !== null) cancelAnimationFrame(animation);
  };
}
