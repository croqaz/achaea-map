window.MAP = {};
window.AREA = {};
window.LEVEL = 0;

const EXITS = {
  north: 'n',
  south: 's',
  east: 'e',
  west: 'w',
  northeast: 'ne',
  northwest: 'nw',
  southeast: 'se',
  southwest: 'sw',
  up: 'u',
  down: 'd',
};

async function fetchMap(name) {
  const res = await fetch(`maps/${name}-map.json`);
  const MAP = await res.json();

  let areaID = '11';
  // Is there any area ID in the hash?
  if (location.hash.length > 1 && location.hash.startsWith('#')) {
    try {
      areaID = parseInt(location.hash.slice(1)).toString();
    } catch {}
  }

  const areaList = [];
  for (const uid of Object.keys(MAP.areas)) {
    let name = MAP.areas[uid].name;
    let details = name.match(/ \(.+?\)$/);
    if (details) {
      details = details[0];
      name = name.slice(0, -details.length);
    }
    let names = name.split(', ');
    if (names.length >= 2) {
      names = [names[1], names[0], ...names.slice(2)];
    }
    if (details) names.push(details);
    name = names.join(' ').replace(/^the /i, '');
    areaList.push([uid, name]);
  }
  areaList.sort((a, b) => {
    if (a[1] < b[1]) {
      return -1;
    }
    if (a[1] > b[1]) {
      return 1;
    }
    return 0;
  });

  // Populate areas list
  const selectArea = document.getElementById('area');
  for (const [uid, name] of areaList) {
    const opt = document.createElement('option');
    if (uid === areaID) opt.selected = true;
    opt.value = uid;
    opt.text = name;
    selectArea.add(opt);
  }
  selectArea.onchange = () => {
    window.LEVEL = 0;
    drawMap();
    location.hash = `#${window.AREA.id}`;
  };

  return MAP;
}

window.addEventListener('load', async function () {
  window.OFFICIAL_MAP = await fetchMap('official');
  window.CROWD_MAP = await fetchMap('crowd');
  window.MAP = window.OFFICIAL_MAP;
  window.LEVEL = 0;

  // Setup Paper.js
  const canvas = document.getElementById('map');
  const p = new paper.PaperScope();
  p.setup(canvas);
  const tool = new p.Tool();
  tool.maxDistance = 50;
  window.PAPER = p;

  for (const src of document.querySelectorAll('#source input[name=source]')) {
    src.onchange = function () {
      window.LEVEL = 0;
      drawMap();
    };
  }

  canvas.onwheel = function (event) {
    const scale = Math.round(event.deltaY / 10) / 120;
    if (scale > 0 && p.view.zoom <= 0.2) return false;
    if (scale < 0 && p.view.zoom > 5) return false;
    p.view.scale(1 - parseFloat(scale.toFixed(1)));
    return false;
  };

  drawMap();
});

function prepareArea(source) {
  const UID = document.getElementById('area').value;
  const area = JSON.parse(JSON.stringify(MAP.areas[UID]));
  area.id = UID;
  const levels = new Set();

  if (source === 'crowd') {
    // Logic for the crowd map
    if (area.rooms) {
      for (const i of Object.keys(area.rooms)) {
        const room = { ...area.rooms[i] };
        room.id = i;
        room.environment = { id: room.environment, ...MAP.environments[room.environment] };
        area.rooms[i] = room;
        levels.add(room.coord.z || 0);
      }
    }
  } else {
    // Logic for the official map
    area.rooms = {};
    for (const i of Object.keys(MAP.rooms)) {
      const room = { ...MAP.rooms[i] };
      if (room.area === UID) {
        room.id = i;
        delete room.area;
        room.environment = { id: room.environment, ...MAP.environments[room.environment] };
        area.rooms[i] = room;
        levels.add(room.coord.z || 0);
      }
    }
  }

  area.levels = Array.from(levels).toSorted((a, b) => a - b);
  // Check no. rooms for this area
  source = source.toUpperCase();
  const noRooms = Object.keys(area.rooms).length;
  if (noRooms) console.log(`${source} Area:`, area.name, 'Rooms:', noRooms);
  else console.error(`${source} Area:`, area.name, 'has NO ROOMS!');
  return area;
}

function drawLevel() {
  const { levels } = window.AREA;
  document.getElementById('level').innerHTML = levels
    .map((x) => (x === window.LEVEL ? `<b>*${x}</b>` : x))
    .join(', ');
}

function drawMap() {
  const source = document.querySelector('#source input[name=source]:checked').value;
  window.MAP = window[`${source.toUpperCase()}_MAP`];
  const area = prepareArea(source);

  const { Group, Layer, Path, PointText, view, tool } = window.PAPER;
  window.PAPER.project.clear();
  window.AREA = area;
  drawLevel();

  const GRID = 32;
  const FONT = 16;

  const mainLayer = new Layer();
  const pathGroup = new Group();
  const roomGroup = new Group();
  mainLayer.addChild(pathGroup);
  mainLayer.addChild(roomGroup);

  let titleBorder = null;
  const roomTitle = new PointText({
    justification: 'center',
    fillColor: '#333',
    fontFamily: 'Serif',
    fontSize: FONT / 2,
    visible: false,
  });
  roomGroup.addChild(roomTitle);

  function drawRoom(p1, p2, room) {
    const c = room.environment.htmlcolor || '#aaa';
    const exits = (room.exits || []).map((x) => EXITS[x.name || x.direction] || x.name || x.direction);
    let title = `#${room.id} -- ${room.environment.name}\n${room.title || room.name}`;
    title += `\nExits: ${exits.join(', ')}`;
    const group = new Group();

    // Crowd map
    if (room.userData) {
      if (
        room.userData['feature-shop'] ||
        room.userData['feature-commodityshop'] ||
        room.userData['feature-bank']
      ) {
        let content = '$';
        if (room.userData['feature-commodityshop']) content = 'C';
        else if (room.userData['feature-bank']) content = 'B';
        group.addChild(
          new PointText({
            content,
            point: [p1, p2 + FONT / 3],
            justification: 'center',
            fillColor: '#000',
            fontFamily: 'Serif',
            fontSize: FONT,
          }),
        );
      }
      if (room.userData['feature-grate']) {
        group.addChild(
          new PointText({
            content: 'G',
            point: [p1, p2 + FONT / 3],
            justification: 'center',
            fillColor: '#000',
            fontFamily: 'Serif',
            fontSize: FONT,
          }),
        );
      }
    } // The offficial map doesn't have shops & banks
    else {
      let content = '';
      if (exits.includes('u') && exits.includes('d') && exits.includes('in') && exits.includes('out')) {
        content = '✦';
      } else if (exits.includes('u') && exits.includes('d')) {
        content = '⬍';
      } else if (exits.includes('in') && exits.includes('out')) {
        content = '⬌';
      } else if (exits.includes('u')) {
        content = '▲';
      } else if (exits.includes('d')) {
        content = '▼';
      } else if (exits.includes('in')) {
        content = '❮';
      } else if (exits.includes('out')) {
        content = '❯';
      }
      if (content) {
        group.addChild(
          new PointText({
            content,
            point: [p1, p2 + FONT / 3],
            justification: 'center',
            fillColor: '#000',
            fontFamily: 'Serif',
            fontSize: FONT,
          }),
        );
      }
    }

    const rect = new Path.Rectangle({
      center: [p1, p2],
      size: [GRID / 2, GRID / 2],
      strokeColor: '#1D2021',
      fillColor: c,
      opacity: 0.7,
      data: { title },
    });
    group.addChild(rect);

    rect.onMouseEnter = function () {
      this.selected = true;
      const titlePos = this.position.subtract([0, GRID]);
      roomTitle.content = this.data.title;
      roomTitle.position = titlePos;
      roomTitle.visible = true;
      // Border around the room info
      titleBorder = new Path.Rectangle({
        center: titlePos,
        size: [roomTitle.strokeBounds.width + 4, FONT * 2],
        strokeColor: '#1D2021',
        fillColor: '#EEE',
      });
      roomGroup.addChild(titleBorder);
      // Room info must be on top
      roomTitle.bringToFront();
    };
    rect.onMouseLeave = function () {
      this.selected = false;
      roomTitle.visible = false;
      titleBorder.remove();
    };

    return group;
  }

  function drawPath(p1, p2, tgt, exit) {
    const D = 24;
    // Current level
    const L = tgt ? tgt.coord.z : NaN;
    // Short exit names
    const dir = EXITS[exit.name || exit.direction] || exit.name || exit.direction;

    let tgtCoord = tgt ? tgt.coord : { x: p1, y: p2 - D };
    if (exit.customLine && exit.customLine.coordinates) {
      const customCoord = exit.customLine.coordinates[0];
      tgtCoord = {
        x: Math.round(customCoord[0]),
        y: Math.round(customCoord[1]),
      };
    }

    // Hack to fix the broken coords to other levels in the same Area
    let toPoint = [tgtCoord.x * GRID, -tgtCoord.y * GRID];
    if (L !== window.LEVEL) {
      if (dir === 'w' || dir === 'in') toPoint = [p1 - D, p2];
      else if (dir === 'e' || dir === 'out') toPoint = [p1 + D, p2];
      else if (dir === 's' || dir === 'd') toPoint = [p1, p2 + D];
      else if (dir === 'n' || dir === 'u') toPoint = [p1, p2 - D];
      else if (dir === 'se') toPoint = [p1 + D, p2 + D];
      else if (dir === 'se') toPoint = [p1 + D, p2 + D];
      else if (dir === 'sw') toPoint = [p1 - D, p2 + D];
      else if (dir === 'ne') toPoint = [p1 + D, p2 - D];
      else if (dir === 'nw') toPoint = [p1 - D, p2 - D];
    }

    const path = new Path.Line({
      from: [p1, p2],
      to: toPoint,
      strokeColor: '#504945',
      strokeCap: 'round',
      strokeWidth: 2,
    });

    if (L !== window.LEVEL) {
      path.dashArray = [2, 4];
      path.strokeColor = '#888';
    } else if (dir === 'in' || dir === 'out') {
      path.dashArray = [2, 6];
      path.strokeColor = 'red';
    } else if (dir === 'u' || dir === 'd') {
      path.dashArray = [2, 6];
      path.strokeColor = 'blue';
    } else if (dir === 'worm warp') {
      path.strokeWidth = 1;
      path.dashArray = [2, 6];
      path.strokeColor = '#999';
    }
    return path;
  }

  for (const room of Object.values(area.rooms)) {
    if (room.coord.z !== window.LEVEL) continue;
    const p1 = parseInt(room.coord.x) * GRID;
    const p2 = -parseInt(room.coord.y) * GRID;

    // Draw the room
    roomGroup.addChild(drawRoom(p1, p2, room));

    // Draw exits
    if (!room.exits) continue;
    for (const exit of room.exits) {
      const tgt = area.rooms[exit.target || exit.exitId];
      // Draw the path
      pathGroup.addChild(drawPath(p1, p2, tgt, exit));
    }
  }

  const topCenter = roomGroup.bounds.topCenter;
  roomGroup.addChild(
    new PointText({
      point: [topCenter.x, topCenter.y - FONT],
      content: area.name,
      justification: 'center',
      fillColor: '#504945',
      fontFamily: 'Serif',
      fontWeight: 'bold',
      fontSize: FONT,
    }),
  );

  mainLayer.position = view.center;

  tool.onMouseDrag = (event) => {
    mainLayer.translate(event.delta);
  };

  tool.onKeyDown = function (event) {
    const minLvl = Math.min(...window.AREA.levels);
    const maxLvl = Math.max(...window.AREA.levels);
    let intKey = null;
    try {
      intKey = parseInt(event.key);
    } catch {}

    if (event.key === '[' || event.key === '{') {
      window.LEVEL--;
      if (window.LEVEL < minLvl) {
        window.LEVEL = minLvl;
        return;
      }
      drawMap();
    } else if (event.key === ']' || event.key === '}') {
      window.LEVEL++;
      if (window.LEVEL > maxLvl) {
        window.LEVEL = maxLvl;
        return;
      }
      drawMap();
    } else if (window.AREA.levels.includes(intKey)) {
      window.LEVEL = intKey;
      drawMap();
    }

    if (event.key === '-' || event.key === '_') {
      if (view.zoom <= 0.2) return false;
      view.scale(0.9);
      return false;
    } else if (event.key === '+' || event.key === '=') {
      if (view.zoom > 5) return false;
      view.scale(1.1);
      return false;
    } else if (event.key === '0') {
      view.zoom = 1;
      mainLayer.position = view.center;
      // Prevent the event from bubbling
      return false;
    }
  };
}
