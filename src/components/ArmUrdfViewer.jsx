import React from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import URDFLoader from 'urdf-loader';

const URDF_PATH = '/resources/arm02/reBot_B601_DM_with_gripper/urdf/reBot_B601_DM_with_gripper.urdf';
const DEFAULT_CAMERA_POS = new THREE.Vector3(1.15, 0.95, 1.2);
const DEFAULT_TARGET = new THREE.Vector3(0, 0.35, 0);
const TRAIL_MAX_POINTS = 1200;
const TRAIL_SAMPLE_MIN_DIST = 0.001;
const SAFE_ZERO_SEGMENT = [0, 0, 0, 0, 0, 0];

function setLinePositionsSafe(line, flatPositions) {
  if (!line?.geometry) return;
  if (!Array.isArray(flatPositions) || flatPositions.length < 6) {
    line.geometry.setPositions(SAFE_ZERO_SEGMENT);
    line.computeLineDistances?.();
    line.geometry.computeBoundingSphere?.();
    return;
  }
  line.geometry.setPositions(flatPositions);
  line.computeLineDistances?.();
  line.geometry.computeBoundingSphere?.();
}

function normalizeJointMapValue(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  Object.entries(raw).forEach(([k, v]) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    const key = String(k || '');
    if (/^joint\d+$/i.test(key)) {
      out[key.toLowerCase()] = n;
      return;
    }
    if (/^\d+$/.test(key)) {
      out[`joint${Number(key)}`] = n;
    }
  });
  return Object.keys(out).length ? out : null;
}

function interpolateJointMapValue(a, b, t) {
  const aj = a && typeof a === 'object' ? a : null;
  const bj = b && typeof b === 'object' ? b : null;
  if (!aj && !bj) return null;
  const keys = new Set([...(aj ? Object.keys(aj) : []), ...(bj ? Object.keys(bj) : [])]);
  const out = {};
  keys.forEach((k) => {
    const av = Number(aj?.[k]);
    const bv = Number(bj?.[k]);
    if (Number.isFinite(av) && Number.isFinite(bv)) out[k] = av + (bv - av) * t;
    else if (Number.isFinite(av)) out[k] = av;
    else if (Number.isFinite(bv)) out[k] = bv;
  });
  return Object.keys(out).length ? out : null;
}

function disposeMaterial(material) {
  if (!material) return;
  const mats = Array.isArray(material) ? material : [material];
  mats.forEach((m) => {
    m?.map?.dispose?.();
    m?.dispose?.();
  });
}

function makeWaypointLabelSprite(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  const label = String(text || '').slice(0, 32);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(12, 31, 63, 0.84)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
  ctx.lineWidth = 4;
  const x = 14;
  const y = 22;
  const w = canvas.width - 28;
  const h = canvas.height - 44;
  const r = 32;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = `#${(Number(color || 0x3b82f6) >>> 0).toString(16).padStart(6, '0')}`;
  ctx.beginPath();
  ctx.arc(58, 80, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = '700 42px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = '#f8fbff';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 92, 82);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 1510;
  sprite.userData = { labelText: label, labelColor: Number(color || 0x3b82f6) >>> 0 };
  sprite.scale.set(0.18, 0.056, 1);
  return sprite;
}

export function ArmUrdfViewer({
  jointTargets,
  resetViewSeq = 0,
  clearTrailSeq = 0,
  exportTrailSeq = 0,
  replaySeq = 0,
  replayStopSeq = 0,
  replayFinishSeq = 0,
  replaySpeed = 1,
  importedTrail = null,
  simMode = 'direct',
  trailColor = '#ff0000',
  trailStyle = 'mono',
  trailVisible = true,
  onReplayStateChange,
  waypointMarkers = [],
  pickEnabled = false,
  pickPlaneY = 0.18,
  pickBounds = null,
  previewMarker = null,
  onMarkerSelect,
  onViewportClick,
  onPreviewDrag,
}) {
  const hostRef = React.useRef(null);
  const robotRef = React.useRef(null);
  const cameraRef = React.useRef(null);
  const controlsRef = React.useRef(null);
  const modeRef = React.useRef(simMode);
  const trailVisibleRef = React.useRef(trailVisible);
  const trailColorRef = React.useRef(trailColor);
  const trailStyleRef = React.useRef(trailStyle);
  const targetRef = React.useRef(jointTargets || {});
  const animJointRef = React.useRef({});
  const trailLineRef = React.useRef(null);
  const trailRainbowRef = React.useRef(null);
  const trailDotsRef = React.useRef(null);
  const trailPointsRef = React.useRef([]);
  const trailFramesRef = React.useRef([]);
  const endEffectorRef = React.useRef(null);
  const trailHeadRef = React.useRef(null);
  const importedFramesRef = React.useRef([]);
  const replayRef = React.useRef({ active: false, frames: [], cursor: 0 });
  const replayBusyRef = React.useRef(false);
  const replaySpeedRef = React.useRef(Math.max(0.05, Number(replaySpeed) || 1));
  const onReplayStateChangeRef = React.useRef(onReplayStateChange);
  const onViewportClickRef = React.useRef(onViewportClick);
  const onPreviewDragRef = React.useRef(onPreviewDrag);
  const onMarkerSelectRef = React.useRef(onMarkerSelect);
  const pickEnabledRef = React.useRef(Boolean(pickEnabled));
  const pickPlaneYRef = React.useRef(Number(pickPlaneY) || 0.18);
  const pickBoundsRef = React.useRef(pickBounds);
  const previewMarkerRef = React.useRef(previewMarker);
  const tmpWorldRef = React.useRef(new THREE.Vector3());
  const waypointGroupRef = React.useRef(null);
  const waypointMeshMapRef = React.useRef(new Map());
  const waypointLabelMapRef = React.useRef(new Map());
  const pickVolumeGroupRef = React.useRef(null);
  const pickBoxRef = React.useRef(null);
  const pickPlaneMeshRef = React.useRef(null);
  const previewMeshRef = React.useRef(null);
  const manipulatorGroupRef = React.useRef(null);
  const dragAxisRef = React.useRef(null);
  const dragStartRef = React.useRef(null);
  const [status, setStatus] = React.useState('loading');

  React.useEffect(() => {
    onReplayStateChangeRef.current = onReplayStateChange;
  }, [onReplayStateChange]);

  React.useEffect(() => {
    onViewportClickRef.current = onViewportClick;
  }, [onViewportClick]);
  React.useEffect(() => {
    onPreviewDragRef.current = onPreviewDrag;
  }, [onPreviewDrag]);
  React.useEffect(() => {
    onMarkerSelectRef.current = onMarkerSelect;
  }, [onMarkerSelect]);
  React.useEffect(() => {
    pickEnabledRef.current = Boolean(pickEnabled);
  }, [pickEnabled]);
  React.useEffect(() => {
    pickPlaneYRef.current = Number(pickPlaneY) || 0.18;
  }, [pickPlaneY]);
  React.useEffect(() => {
    pickBoundsRef.current = pickBounds;
  }, [pickBounds]);
  React.useEffect(() => {
    previewMarkerRef.current = previewMarker;
  }, [previewMarker]);

  const applyTrajectoryColor = React.useCallback((hexColor) => {
    const color = new THREE.Color(hexColor || '#ff0000');
    const lineMat = trailLineRef.current?.material;
    const dotsMat = trailDotsRef.current?.material;
    if (lineMat?.color) lineMat.color.copy(color);
    if (dotsMat?.color) dotsMat.color.copy(color);
  }, []);

  const setReplayBusy = React.useCallback((next) => {
    const busy = Boolean(next);
    if (replayBusyRef.current === busy) return;
    replayBusyRef.current = busy;
    if (typeof onReplayStateChangeRef.current === 'function') onReplayStateChangeRef.current(busy);
  }, []);

  const captureJointSnapshot = React.useCallback(() => {
    const robot = robotRef.current;
    if (!robot?.joints) return null;
    const out = {};
    Object.entries(robot.joints).forEach(([name, j]) => {
      let v = Number.NaN;
      if (Array.isArray(j?.jointValue)) v = Number(j.jointValue[0]);
      else v = Number(j?.jointValue);
      if (!Number.isFinite(v)) v = Number(j?.angle);
      if (Number.isFinite(v)) out[name] = v;
    });
    return Object.keys(out).length ? out : null;
  }, []);

  const applyJointMap = React.useCallback((map) => {
    const robot = robotRef.current;
    if (!robot?.joints || !map || typeof map !== 'object') return;
    const nextAnim = { ...animJointRef.current };
    Object.entries(map).forEach(([jointName, targetRaw]) => {
      const target = Number(targetRaw);
      if (!Number.isFinite(target)) return;
      const j = robot.joints?.[jointName];
      if (!j?.setJointValue) return;
      j.setJointValue(target);
      nextAnim[jointName] = target;
    });
    animJointRef.current = nextAnim;
  }, []);

  const interpolateJointMap = React.useCallback(interpolateJointMapValue, []);

  const pushTrailPoint = React.useCallback((point, joints = null) => {
    const line = trailLineRef.current;
    const rainbowLine = trailRainbowRef.current;
    const dots = trailDotsRef.current;
    if (!line || !point) return;
    const rawPoints = trailPointsRef.current;
    const rawFrames = trailFramesRef.current;
    rawPoints.push(point.clone());
    rawFrames.push({
      pos: point.clone(),
      joints: normalizeJointMapValue(joints),
    });
    if (rawPoints.length > TRAIL_MAX_POINTS) rawPoints.splice(0, rawPoints.length - TRAIL_MAX_POINTS);
    if (rawFrames.length > TRAIL_MAX_POINTS) rawFrames.splice(0, rawFrames.length - TRAIL_MAX_POINTS);

    const flat = [];
    rawPoints.forEach((p) => {
      flat.push(p.x, p.y, p.z);
    });
    // LineGeometry requires at least 2 points (6 floats), otherwise it throws.
    if (flat.length < 6 && flat.length >= 3) {
      flat.push(flat[0], flat[1], flat[2]);
    }
    setLinePositionsSafe(line, flat);
    if (rainbowLine?.geometry) {
      const posArr = [];
      const colArr = [];
      const base = new THREE.Color(trailColorRef.current || '#ff0000');
      const hsl = { h: 0, s: 1, l: 0.5 };
      base.getHSL(hsl);
      rawPoints.forEach((p, i) => {
        posArr.push(p.x, p.y, p.z);
        let c = base;
        if (trailStyleRef.current === 'multi') {
          const t = rawPoints.length > 1 ? i / (rawPoints.length - 1) : 0;
          c = new THREE.Color().setHSL((hsl.h + 0.25 * t) % 1, Math.min(1, hsl.s * 0.95 + 0.05), 0.42 + 0.25 * t);
        }
        colArr.push(c.r, c.g, c.b);
      });
      rainbowLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
      rainbowLine.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colArr, 3));
      rainbowLine.geometry.computeBoundingSphere();
    }
    if (dots?.geometry) {
      dots.geometry.setFromPoints(rawPoints);
      dots.geometry.computeBoundingSphere();
    }
  }, []);

  const clearTrail = React.useCallback(() => {
    trailPointsRef.current = [];
    trailFramesRef.current = [];
    if (trailLineRef.current?.geometry) {
      setLinePositionsSafe(trailLineRef.current, SAFE_ZERO_SEGMENT);
    }
    if (trailDotsRef.current?.geometry) {
      trailDotsRef.current.geometry.setFromPoints([]);
      trailDotsRef.current.geometry.computeBoundingSphere();
    }
    if (trailRainbowRef.current?.geometry) {
      trailRainbowRef.current.geometry.setAttribute('position', new THREE.Float32BufferAttribute(SAFE_ZERO_SEGMENT, 3));
      trailRainbowRef.current.geometry.setAttribute(
        'color',
        new THREE.Float32BufferAttribute([1, 0, 0, 1, 0, 0], 3),
      );
      trailRainbowRef.current.geometry.computeBoundingSphere();
    }
  }, []);

  React.useEffect(() => {
    modeRef.current = simMode;
    const line = trailLineRef.current;
    const rainbowLine = trailRainbowRef.current;
    const dots = trailDotsRef.current;
    const canShow = simMode === 'trajectory' && trailVisibleRef.current;
    if (line) line.visible = canShow && trailStyleRef.current !== 'multi';
    if (rainbowLine) rainbowLine.visible = canShow;
    if (dots) dots.visible = canShow;
    if (simMode === 'trajectory') {
      const robot = robotRef.current;
      if (robot?.joints) {
        const next = {};
        Object.entries(targetRef.current || {}).forEach(([jointName, target]) => {
          if (!Number.isFinite(target)) return;
          const joint = robot.joints?.[jointName];
          if (!joint?.setJointValue) return;
          next[jointName] = Number(target);
          joint.setJointValue(Number(target));
        });
        animJointRef.current = next;
      }
      clearTrail();
      const eff = endEffectorRef.current;
      if (eff) {
        const p = eff.getWorldPosition(tmpWorldRef.current).clone();
        pushTrailPoint(p, captureJointSnapshot());
      }
    } else {
      clearTrail();
    }
  }, [simMode, clearTrail, pushTrailPoint, captureJointSnapshot]);

  React.useEffect(() => {
    trailColorRef.current = trailColor;
    applyTrajectoryColor(trailColor);
  }, [trailColor, applyTrajectoryColor]);

  React.useEffect(() => {
    trailStyleRef.current = trailStyle;
    const canShow = modeRef.current === 'trajectory' && trailVisibleRef.current;
    if (trailLineRef.current) {
      trailLineRef.current.visible = canShow && trailStyle !== 'multi';
    }
    if (trailRainbowRef.current) {
      trailRainbowRef.current.visible = canShow;
    }
  }, [trailStyle]);

  React.useEffect(() => {
    trailVisibleRef.current = trailVisible;
    const canShow = modeRef.current === 'trajectory' && trailVisible;
    if (trailLineRef.current) {
      trailLineRef.current.visible = canShow && trailStyleRef.current !== 'multi';
    }
    if (trailRainbowRef.current) {
      trailRainbowRef.current.visible = canShow;
    }
    if (trailDotsRef.current) {
      trailDotsRef.current.visible = canShow;
    }
    if (trailHeadRef.current) {
      trailHeadRef.current.visible = canShow;
    }
  }, [trailVisible]);

  React.useEffect(() => {
    clearTrail();
  }, [clearTrailSeq, clearTrail]);

  React.useEffect(() => {
    if (!exportTrailSeq) return;
    const frames = trailFramesRef.current || [];
    if (frames.length === 0) return;
    const payload = {
      schema: 'arm_traj_sequence_v2',
      frame: 'world',
      point_count: frames.length,
      exported_at: new Date().toISOString(),
      points: frames.map((f, i) => {
        const item = {
          i,
          x: Number(f?.pos?.x),
          y: Number(f?.pos?.y),
          z: Number(f?.pos?.z),
        };
        if (f?.joints && Object.keys(f.joints).length > 0) item.joints = f.joints;
        return item;
      }),
    };
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json;charset=utf-8' });
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const fileName = `arm_traj_sequence_${ts}.json`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [exportTrailSeq]);

  React.useEffect(() => {
    replaySpeedRef.current = Math.max(0.05, Number(replaySpeed) || 1);
  }, [replaySpeed]);

  React.useEffect(() => {
    const raw = importedTrail?.points;
    if (!Array.isArray(raw) || raw.length < 2) return;
    const frames = raw
      .map((p) => {
        const x = Number(p?.x);
        const y = Number(p?.y);
        const z = Number(p?.z);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
        return {
          pos: new THREE.Vector3(x, y, z),
          joints: normalizeJointMapValue(p?.joints),
        };
      })
      .filter(Boolean);
    if (frames.length < 2) return;
    importedFramesRef.current = frames;
    replayRef.current = { active: false, frames: [], cursor: 0 };
    setReplayBusy(false);
    // Import stores sequence only; it doesn't auto-render full trajectory.
    // User triggers replay explicitly.
    if (trailHeadRef.current) trailHeadRef.current.position.copy(frames[0].pos);
  }, [importedTrail, setReplayBusy]);

  React.useEffect(() => {
    if (!replaySeq) return;
    const frames = importedFramesRef.current || [];
    if (frames.length < 2) return;
    clearTrail();
    if (trailHeadRef.current) trailHeadRef.current.position.copy(frames[0].pos);
    applyJointMap(frames[0].joints);
    if (trailVisibleRef.current) pushTrailPoint(frames[0].pos, frames[0].joints);
    replayRef.current = { active: true, frames, cursor: 0 };
    setReplayBusy(true);
  }, [replaySeq, clearTrail, pushTrailPoint, applyJointMap, setReplayBusy]);

  React.useEffect(() => {
    if (!replayStopSeq) return;
    const replay = replayRef.current;
    if (!replay.active) return;
    replay.active = false;
    setReplayBusy(false);
  }, [replayStopSeq, setReplayBusy]);

  React.useEffect(() => {
    if (!replayFinishSeq) return;
    const replay = replayRef.current;
    if (!replay.active || replay.frames.length === 0) return;
    const lastFrame = replay.frames[replay.frames.length - 1];
    if (trailHeadRef.current) trailHeadRef.current.position.copy(lastFrame.pos);
    applyJointMap(lastFrame.joints);
    if (trailVisibleRef.current) pushTrailPoint(lastFrame.pos.clone(), lastFrame.joints);
    replay.cursor = replay.frames.length - 1;
    replay.active = false;
    setReplayBusy(false);
  }, [replayFinishSeq, applyJointMap, pushTrailPoint, setReplayBusy]);

  React.useEffect(() => {
    targetRef.current = jointTargets || {};
    if (modeRef.current !== 'direct') return;
    const robot = robotRef.current;
    if (!robot) return;
    Object.entries(targetRef.current).forEach(([jointName, rad]) => {
      if (!Number.isFinite(rad)) return;
      const j = robot.joints?.[jointName];
      if (j?.setJointValue) j.setJointValue(rad);
    });
  }, [jointTargets]);

  React.useEffect(() => {
    const group = waypointGroupRef.current;
    if (!group) return;
    const meshMap = waypointMeshMapRef.current;
    const labelMap = waypointLabelMapRef.current;
    const nextIds = new Set();
    (Array.isArray(waypointMarkers) ? waypointMarkers : []).forEach((wp) => {
      const wid = String(wp?.id || '');
      if (!wid) return;
      nextIds.add(wid);
      const x = Number(wp?.x);
      const y = Number(wp?.y);
      const z = Number(wp?.z);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
      const color = Number(wp?.color || 0x3b82f6) >>> 0;
      const labelText = String(wp?.label || wid);
      let marker = meshMap.get(wid);
      if (!marker) {
        marker = new THREE.Mesh(
          new THREE.SphereGeometry(0.014, 14, 14),
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.96,
            depthTest: false,
            depthWrite: false,
          }),
        );
        marker.renderOrder = 1500;
        marker.userData = { waypointId: wid };
        group.add(marker);
        meshMap.set(wid, marker);
      } else if (marker.material?.color) {
        marker.material.color.setHex(color);
      }
      // Slight lift avoids coplanar shimmer against grid.
      marker.position.set(x, y + 0.006, z);

      let label = labelMap.get(wid);
      const labelColor = Number(color || 0x3b82f6) >>> 0;
      if (!label) {
        label = makeWaypointLabelSprite(labelText, labelColor);
        label.userData.waypointId = wid;
        group.add(label);
        labelMap.set(wid, label);
      } else if (label.userData?.labelText !== labelText || label.userData?.labelColor !== labelColor) {
        group.remove(label);
        disposeMaterial(label.material);
        label = makeWaypointLabelSprite(labelText, labelColor);
        label.userData.waypointId = wid;
        group.add(label);
        labelMap.set(wid, label);
      }
      label.position.set(x, y + 0.052, z);
    });
    Array.from(meshMap.keys()).forEach((id) => {
      if (nextIds.has(id)) return;
      const marker = meshMap.get(id);
      if (marker) {
        group.remove(marker);
        marker.geometry?.dispose?.();
        marker.material?.dispose?.();
      }
      meshMap.delete(id);
    });
    Array.from(labelMap.keys()).forEach((id) => {
      if (nextIds.has(id)) return;
      const label = labelMap.get(id);
      if (label) {
        group.remove(label);
        disposeMaterial(label.material);
      }
      labelMap.delete(id);
    });
  }, [waypointMarkers]);

  React.useEffect(() => {
    const pickGroup = pickVolumeGroupRef.current;
    if (!pickGroup) return;
    const enabled = Boolean(pickEnabled);
    pickGroup.visible = enabled;
    const b = pickBounds || { xMin: -0.45, xMax: 0.45, yMin: 0.02, yMax: 0.55, zMin: -0.45, zMax: 0.45 };
    const sx = Number(b.xMax) - Number(b.xMin);
    const sy = Number(b.yMax) - Number(b.yMin);
    const sz = Number(b.zMax) - Number(b.zMin);
    const cx = (Number(b.xMin) + Number(b.xMax)) / 2;
    const cy = (Number(b.yMin) + Number(b.yMax)) / 2;
    const cz = (Number(b.zMin) + Number(b.zMax)) / 2;
    if (pickBoxRef.current) {
      pickBoxRef.current.scale.set(Math.max(0.001, sx), Math.max(0.001, sy), Math.max(0.001, sz));
      pickBoxRef.current.position.set(cx, cy, cz);
    }
    if (pickPlaneMeshRef.current) {
      pickPlaneMeshRef.current.scale.set(Math.max(0.001, sx), Math.max(0.001, sz), 1);
      pickPlaneMeshRef.current.position.set(cx, Number(pickPlaneY) || cy, cz);
    }
  }, [pickEnabled, pickPlaneY, pickBounds]);

  React.useEffect(() => {
    const marker = previewMeshRef.current;
    const manipulator = manipulatorGroupRef.current;
    if (!marker) return;
    const p = previewMarker;
    const visible = Boolean(p && pickEnabled);
    marker.visible = visible;
    if (manipulator) manipulator.visible = visible;
    if (!visible) return;
    marker.position.set(Number(p.x || 0), Number(p.y || 0) + 0.012, Number(p.z || 0));
    if (manipulator) manipulator.position.set(Number(p.x || 0), Number(p.y || 0) + 0.012, Number(p.z || 0));
    if (marker.material?.color) marker.material.color.setHex(Number(p.color || 0xffb020));
  }, [previewMarker, pickEnabled]);

  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(host.clientWidth || 640, host.clientHeight || 400);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf7fbff);

    const camera = new THREE.PerspectiveCamera(48, (host.clientWidth || 640) / (host.clientHeight || 400), 0.01, 20);
    camera.position.copy(DEFAULT_CAMERA_POS);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(DEFAULT_TARGET);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.update();
    controlsRef.current = controls;

    const hemi = new THREE.HemisphereLight(0xffffff, 0x8ca6db, 1.0);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(2.0, 3.0, 1.6);
    scene.add(dir);
    const fill = new THREE.DirectionalLight(0xaec6ff, 0.5);
    fill.position.set(-1.2, 1.8, -1.4);
    scene.add(fill);

    const grid = new THREE.GridHelper(2.2, 24, 0x94ace1, 0xcad8f8);
    grid.position.y = -0.02;
    scene.add(grid);
    const waypointGroup = new THREE.Group();
    waypointGroup.name = 'waypoint-markers';
    scene.add(waypointGroup);
    waypointGroupRef.current = waypointGroup;

    const pickVolumeGroup = new THREE.Group();
    pickVolumeGroup.name = 'pick-volume';
    pickVolumeGroup.visible = pickEnabledRef.current;
    scene.add(pickVolumeGroup);
    pickVolumeGroupRef.current = pickVolumeGroup;

    const pickBox = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: 0x8aa8de, transparent: true, opacity: 0.55 }),
    );
    pickBox.renderOrder = 1200;
    pickVolumeGroup.add(pickBox);
    pickBoxRef.current = pickBox;

    const pickPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: 0x83b4ff,
        transparent: true,
        opacity: 0.14,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    pickPlane.rotation.x = -Math.PI / 2;
    pickPlane.renderOrder = 1100;
    pickVolumeGroup.add(pickPlane);
    pickPlaneMeshRef.current = pickPlane;

    const previewMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 16, 16),
      new THREE.MeshBasicMaterial({
        color: 0xffb020,
        transparent: true,
        opacity: 0.98,
        depthTest: false,
        depthWrite: false,
      }),
    );
    previewMesh.visible = false;
    previewMesh.renderOrder = 1600;
    scene.add(previewMesh);
    previewMeshRef.current = previewMesh;

    const makeAxisHandle = (axis, color, rotation) => {
      const group = new THREE.Group();
      group.userData = { axis };
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.004, 0.004, 0.16, 10),
        new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false }),
      );
      shaft.position.y = 0.08;
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.014, 0.035, 12),
        new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false }),
      );
      cone.position.y = 0.175;
      group.add(shaft);
      group.add(cone);
      group.rotation.set(rotation.x, rotation.y, rotation.z);
      group.traverse((obj) => {
        obj.renderOrder = 1700;
        obj.userData = { axis };
      });
      return group;
    };
    const manipulator = new THREE.Group();
    manipulator.visible = false;
    manipulator.add(makeAxisHandle('y', 0x2fbf71, { x: 0, y: 0, z: 0 }));
    manipulator.add(makeAxisHandle('x', 0xe74b3c, { x: 0, y: 0, z: -Math.PI / 2 }));
    manipulator.add(makeAxisHandle('z', 0x3578ff, { x: Math.PI / 2, y: 0, z: 0 }));
    scene.add(manipulator);
    manipulatorGroupRef.current = manipulator;

    const initialBounds = pickBoundsRef.current || { xMin: -0.45, xMax: 0.45, yMin: 0.02, yMax: 0.55, zMin: -0.45, zMax: 0.45 };
    const initialSx = Number(initialBounds.xMax) - Number(initialBounds.xMin);
    const initialSy = Number(initialBounds.yMax) - Number(initialBounds.yMin);
    const initialSz = Number(initialBounds.zMax) - Number(initialBounds.zMin);
    const initialCx = (Number(initialBounds.xMin) + Number(initialBounds.xMax)) / 2;
    const initialCy = (Number(initialBounds.yMin) + Number(initialBounds.yMax)) / 2;
    const initialCz = (Number(initialBounds.zMin) + Number(initialBounds.zMax)) / 2;
    pickBox.scale.set(Math.max(0.001, initialSx), Math.max(0.001, initialSy), Math.max(0.001, initialSz));
    pickBox.position.set(initialCx, initialCy, initialCz);
    pickPlane.scale.set(Math.max(0.001, initialSx), Math.max(0.001, initialSz), 1);
    pickPlane.position.set(initialCx, pickPlaneYRef.current, initialCz);

    const trailGeometry = new LineGeometry();
    trailGeometry.setPositions(SAFE_ZERO_SEGMENT);
    const trailMaterial = new LineMaterial({
      color: 0xff0000,
      linewidth: 5.0,
      transparent: true,
      opacity: 1.0,
      toneMapped: false,
      depthTest: false,
      depthWrite: false,
      dashed: false,
    });
    trailMaterial.resolution.set(host.clientWidth || 640, host.clientHeight || 400);
    const trailLine = new Line2(trailGeometry, trailMaterial);
    trailLine.visible = modeRef.current === 'trajectory';
    trailLine.frustumCulled = false;
    trailLine.renderOrder = 1000;
    trailLine.computeLineDistances();
    scene.add(trailLine);
    trailLineRef.current = trailLine;
    const rainbowGeom = new THREE.BufferGeometry();
    rainbowGeom.setAttribute('position', new THREE.Float32BufferAttribute(SAFE_ZERO_SEGMENT, 3));
    rainbowGeom.setAttribute('color', new THREE.Float32BufferAttribute([1, 0, 0, 1, 0, 0], 3));
    const rainbowMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.98,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const rainbowLine = new THREE.Line(rainbowGeom, rainbowMat);
    rainbowLine.visible = modeRef.current === 'trajectory';
    rainbowLine.frustumCulled = false;
    rainbowLine.renderOrder = 1002;
    scene.add(rainbowLine);
    trailRainbowRef.current = rainbowLine;
    const trailDots = new THREE.Points(
      new THREE.BufferGeometry().setFromPoints([]),
      new THREE.PointsMaterial({
        color: 0xff0000,
        size: 0.03,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
        depthWrite: false,
      }),
    );
    trailDots.visible = modeRef.current === 'trajectory';
    trailDots.frustumCulled = false;
    trailDots.renderOrder = 1000;
    scene.add(trailDots);
    trailDotsRef.current = trailDots;
    applyTrajectoryColor(trailColorRef.current);

    const trailHead = new THREE.Mesh(
      new THREE.SphereGeometry(0.01, 12, 12),
      new THREE.MeshBasicMaterial({
        color: 0xffc93c,
        transparent: true,
        opacity: 0.98,
        depthTest: false,
        depthWrite: false,
      }),
    );
    trailHead.visible = modeRef.current === 'trajectory';
    trailHead.renderOrder = 1001;
    scene.add(trailHead);
    trailHeadRef.current = trailHead;

    const loader = new URDFLoader();
    loader.packages = { reBot_B601_DM_with_gripper: '/resources/arm02/reBot_B601_DM_with_gripper' };
    loader.load(
      URDF_PATH,
      (robot) => {
        // ROS URDF is typically Z-up; this viewer uses Y-up.
        // Rotate to keep the base plate downward and the arm upright on the ground grid.
        robot.rotation.x = -Math.PI / 2;
        robot.position.set(0, 0.02, 0);
        scene.add(robot);
        robotRef.current = robot;
        endEffectorRef.current =
          robot.links?.end_link ||
          robot.links?.link6 ||
          robot.links?.tool0 ||
          robot.links?.ee_link ||
          null;
        if (!endEffectorRef.current) {
          robot.traverse((obj) => {
            if (endEffectorRef.current) return;
            if (obj?.name && /end|ee|tool/i.test(obj.name)) endEffectorRef.current = obj;
          });
        }
        if (!endEffectorRef.current) {
          robot.traverse((obj) => {
            if (!obj?.isObject3D) return;
            if (!obj.children || obj.children.length === 0) endEffectorRef.current = obj;
          });
        }
        if (robot?.joints) {
          const next = {};
          Object.entries(targetRef.current || {}).forEach(([jointName, targetRaw]) => {
            const target = Number(targetRaw);
            if (!Number.isFinite(target)) return;
            const j = robot.joints?.[jointName];
            if (!j?.setJointValue) return;
            j.setJointValue(target);
            next[jointName] = target;
          });
          animJointRef.current = next;
        }
        robot.updateMatrixWorld(true);
        clearTrail();
        if (modeRef.current === 'trajectory' && endEffectorRef.current) {
          pushTrailPoint(endEffectorRef.current.getWorldPosition(tmpWorldRef.current).clone(), captureJointSnapshot());
        }
        setStatus('ready');
      },
      undefined,
      () => {
        setStatus('error');
      },
    );

    const smoothStepTrajectory = (dtSec) => {
      const robot = robotRef.current;
      if (!robot?.joints) return;
      const targets = targetRef.current || {};
      const nextState = { ...animJointRef.current };
      Object.entries(targets).forEach(([jointName, targetRaw]) => {
        const target = Number(targetRaw);
        if (!Number.isFinite(target)) return;
        const j = robot.joints?.[jointName];
        if (!j?.setJointValue) return;
        const current = Number.isFinite(nextState[jointName]) ? nextState[jointName] : target;
        const diff = target - current;
        if (Math.abs(diff) < 1e-5) {
          nextState[jointName] = target;
          j.setJointValue(target);
          return;
        }
        const eased = diff * 0.18;
        const maxStep = Math.max(0.006, dtSec * 1.0);
        const step = Math.max(-maxStep, Math.min(maxStep, eased));
        const next = current + step;
        nextState[jointName] = next;
        j.setJointValue(next);
      });
      animJointRef.current = nextState;
    };

    const sampleTrail = () => {
      if (modeRef.current !== 'trajectory') return;
      const eff = endEffectorRef.current;
      const line = trailLineRef.current;
      if (!eff || !line) return;
      robotRef.current?.updateMatrixWorld(true);
      const p = eff.getWorldPosition(tmpWorldRef.current).clone();
      if (trailHeadRef.current) trailHeadRef.current.position.copy(p);
      const raw = trailPointsRef.current;
      const last = raw[raw.length - 1];
      if (!last || last.distanceToSquared(p) >= TRAIL_SAMPLE_MIN_DIST * TRAIL_SAMPLE_MIN_DIST) {
        pushTrailPoint(p, captureJointSnapshot());
      }
    };

    const clock = new THREE.Clock();
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const clickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const clickPoint = new THREE.Vector3();

    const onPointerDown = (ev) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const manipulator = manipulatorGroupRef.current;
      if (manipulator?.visible) {
        const hits = raycaster.intersectObjects(manipulator.children, true);
        const axis = hits.find((h) => h?.object?.userData?.axis)?.object?.userData?.axis;
        if (axis) {
          dragAxisRef.current = axis;
          dragStartRef.current = {
            clientX: ev.clientX,
            clientY: ev.clientY,
            pose: previewMarkerRef.current ? { ...previewMarkerRef.current } : null,
          };
          controls.enabled = false;
          renderer.domElement.setPointerCapture?.(ev.pointerId);
          ev.preventDefault();
          return;
        }
      }
      const markers = Array.from(waypointMeshMapRef.current.values());
      if (markers.length > 0) {
        const hits = raycaster.intersectObjects(markers, false);
        if (hits.length > 0) {
          const id = String(hits[0]?.object?.userData?.waypointId || '');
          if (id && typeof onMarkerSelectRef.current === 'function') onMarkerSelectRef.current(id);
          return;
        }
      }
      if (!pickEnabledRef.current || typeof onViewportClickRef.current !== 'function') return;
      clickPlane.constant = -pickPlaneYRef.current;
      if (raycaster.ray.intersectPlane(clickPlane, clickPoint)) {
        const b = pickBoundsRef.current;
        if (b) {
          clickPoint.x = Math.max(Number(b.xMin), Math.min(Number(b.xMax), clickPoint.x));
          clickPoint.y = Math.max(Number(b.yMin), Math.min(Number(b.yMax), clickPoint.y));
          clickPoint.z = Math.max(Number(b.zMin), Math.min(Number(b.zMax), clickPoint.z));
        }
        onViewportClickRef.current({ x: clickPoint.x, y: clickPoint.y, z: clickPoint.z });
      }
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    const onPointerMove = (ev) => {
      const axis = dragAxisRef.current;
      const start = dragStartRef.current;
      if (!axis || !start?.pose || typeof onPreviewDragRef.current !== 'function') return;
      const dx = ev.clientX - start.clientX;
      const dy = ev.clientY - start.clientY;
      const sensitivity = 0.0022;
      const next = { ...start.pose };
      if (axis === 'x') next.x = Number(start.pose.x || 0) + dx * sensitivity;
      if (axis === 'z') next.z = Number(start.pose.z || 0) + dx * sensitivity;
      if (axis === 'y') next.y = Number(start.pose.y || 0) - dy * sensitivity;
      onPreviewDragRef.current(next);
      ev.preventDefault();
    };
    const onPointerUp = (ev) => {
      if (!dragAxisRef.current) return;
      dragAxisRef.current = null;
      dragStartRef.current = null;
      controls.enabled = true;
      renderer.domElement.releasePointerCapture?.(ev.pointerId);
    };
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerUp);

    let raf = 0;
    const renderLoop = () => {
      const dt = clock.getDelta();
      if (modeRef.current === 'trajectory') {
        if (trailHeadRef.current) trailHeadRef.current.visible = trailVisibleRef.current;
        const replay = replayRef.current;
        if (replay.active && trailHeadRef.current && replay.frames.length >= 2) {
          replay.cursor += dt * 22 * replaySpeedRef.current;
          const idx = Math.floor(replay.cursor);
          if (idx >= replay.frames.length - 1) {
            const lastFrame = replay.frames[replay.frames.length - 1];
            trailHeadRef.current.position.copy(lastFrame.pos);
            applyJointMap(lastFrame.joints);
            if (trailVisibleRef.current) pushTrailPoint(lastFrame.pos.clone(), lastFrame.joints);
            replay.active = false;
            setReplayBusy(false);
          } else {
            const t = replay.cursor - idx;
            const a = replay.frames[idx];
            const b = replay.frames[idx + 1];
            trailHeadRef.current.position.lerpVectors(a.pos, b.pos, t);
            const jointsNow = interpolateJointMap(a.joints, b.joints, t);
            applyJointMap(jointsNow);
            if (trailVisibleRef.current) pushTrailPoint(trailHeadRef.current.position.clone(), jointsNow);
          }
        } else {
          smoothStepTrajectory(dt);
          sampleTrail();
        }
      } else if (trailHeadRef.current) {
        trailHeadRef.current.visible = false;
      }
      controls.update();
      renderer.render(scene, camera);
      raf = window.requestAnimationFrame(renderLoop);
    };
    renderLoop();

    const resize = () => {
      if (!host) return;
      const w = host.clientWidth || 640;
      const h = host.clientHeight || 400;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      const mat = trailLineRef.current?.material;
      if (mat?.resolution) mat.resolution.set(w, h);
    };
    window.addEventListener('resize', resize);

    return () => {
      window.removeEventListener('resize', resize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerUp);
      window.cancelAnimationFrame(raf);
      controls.dispose();
      renderer.dispose();
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose?.();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.());
          else obj.material.dispose?.();
        }
      });
      if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement);
      robotRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      trailLineRef.current = null;
      trailRainbowRef.current = null;
      trailDotsRef.current = null;
      trailHeadRef.current = null;
      waypointGroupRef.current = null;
      pickVolumeGroupRef.current = null;
      pickBoxRef.current = null;
      pickPlaneMeshRef.current = null;
      previewMeshRef.current = null;
      manipulatorGroupRef.current = null;
      waypointMeshMapRef.current.forEach((marker) => {
        marker.geometry?.dispose?.();
        marker.material?.dispose?.();
      });
      waypointMeshMapRef.current.clear();
      waypointLabelMapRef.current.forEach((label) => {
        disposeMaterial(label.material);
      });
      waypointLabelMapRef.current.clear();
      endEffectorRef.current = null;
      trailPointsRef.current = [];
      trailFramesRef.current = [];
      importedFramesRef.current = [];
      replayRef.current = { active: false, frames: [], cursor: 0 };
      setReplayBusy(false);
    };
  }, [
    pushTrailPoint,
    clearTrail,
    applyTrajectoryColor,
    captureJointSnapshot,
    applyJointMap,
    interpolateJointMap,
    setReplayBusy,
  ]);

  React.useEffect(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    camera.position.copy(DEFAULT_CAMERA_POS);
    controls.target.copy(DEFAULT_TARGET);
    controls.update();
    clearTrail();
  }, [resetViewSeq, clearTrail]);

  return (
    <div className="armUrdfViewerShell">
      <div ref={hostRef} className="armUrdfViewer" />
      {status !== 'ready' && (
        <div className="armUrdfOverlay">{status === 'error' ? 'URDF load failed' : 'Loading URDF...'}</div>
      )}
    </div>
  );
}
