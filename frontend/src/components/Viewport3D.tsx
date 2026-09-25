import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { useSwarmStore } from '../store/useSwarmStore';
import { DroneTelemetry, TargetDetection } from '../types/telemetry';
import { tacticalVoice } from '../services/tacticalVoice';
import { tacticalAudio } from '../services/tacticalAudio';
import { 
  Compass, 
  Layers, 
  Crosshair, 
  Navigation, 
  Eye, 
  Radio, 
  ShieldAlert, 
  Sparkles, 
  Maximize2, 
  Minimize2,
  MapPin,
  LocateFixed,
  Flame,
  UserCheck,
  Zap,
  Wifi,
  Shield,
  Gamepad2,
  Camera,
  Activity
} from 'lucide-react';

// Reference coordinate origin (Base Station coordinates in Lima, Peru)
const LAT0 = -12.046374;
const LON0 = -77.042793;
const METERS_PER_LAT = 111320.0;
const METERS_PER_LON = 111320.0 * Math.cos((LAT0 * Math.PI) / 180.0);

function geoToCartesian(lat: number, lon: number, alt: number): [number, number, number] {
  const x = (lon - LON0) * METERS_PER_LON;
  const z = -(lat - LAT0) * METERS_PER_LAT;
  const y = alt;
  return [x, y, z];
}

function cartesianToGeo(x: number, z: number): [number, number] {
  const lat = LAT0 - (z / METERS_PER_LAT);
  const lon = LON0 + (x / METERS_PER_LON);
  return [lat, lon];
}

type CameraPerspective = 'orbit' | 'chase' | 'top_down' | 'base';

interface Viewport3DProps {
  gotoMode?: boolean;
  onTargetDesignated?: (lat: number, lon: number) => void;
  onToggleGotoMode?: () => void;
}

export const Viewport3D: React.FC<Viewport3DProps> = ({ 
  gotoMode = false, 
  onTargetDesignated,
  onToggleGotoMode 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dronesRef = useRef<DroneTelemetry[]>([]);
  const detectionsRef = useRef<TargetDetection[]>([]);
  const selectedDroneId = useSwarmStore(s => s.selectedDroneId);
  const setSelectedDroneId = useSwarmStore(s => s.setSelectedDroneId);
  const ptzRef = useRef(useSwarmStore.getState().ptz);
  const cameraMode = useSwarmStore(s => s.cameraMode);
  const setCameraMode = useSwarmStore(s => s.setCameraMode);
  const groundUnits = useSwarmStore(s => s.groundUnits);
  const dispatchGroundUnit = useSwarmStore(s => s.dispatchGroundUnit);

  // UI state overlays
  const [camMode, setCamMode] = useState<CameraPerspective>('orbit');
  const [showBubbles, setShowBubbles] = useState<boolean>(true);
  const [showTrails, setShowTrails] = useState<boolean>(true);
  const [showDetections, setShowDetections] = useState<boolean>(true);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showLidar, setShowLidar] = useState<boolean>(true);
  const [showRfMesh, setShowRfMesh] = useState<boolean>(true);
  const [showRadarThreat, setShowRadarThreat] = useState<boolean>(true);
  const [fbwActive, setFbwActive] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [pipOpen, setPipOpen] = useState<boolean>(true);
  const [pipMinimized, setPipMinimized] = useState<boolean>(false);
  const [lidarPointCount, setLidarPointCount] = useState<number>(18450);
  const [radarStatusMsg, setRadarStatusMsg] = useState<string | null>(null);

  const [activeDestination, setActiveDestination] = useState<{ x: number; z: number; lat: number; lon: number } | null>(null);
  const [hoveredCoords, setHoveredCoords] = useState<{ x: number; z: number; lat: number; lon: number; dist: number } | null>(null);

  // Sync refs with store without triggering DOM re-renders of the WebGL canvas
  useEffect(() => {
    return useSwarmStore.subscribe(state => {
      dronesRef.current = state.drones;
      detectionsRef.current = state.detections;
      ptzRef.current = state.ptz;
    });
  }, []);

  // Pass active props to Three.js loop via refs
  const gotoModeRef = useRef(gotoMode);
  gotoModeRef.current = gotoMode;
  const onTargetDesignatedRef = useRef(onTargetDesignated);
  onTargetDesignatedRef.current = onTargetDesignated;
  const selectedDroneIdRef = useRef(selectedDroneId);
  selectedDroneIdRef.current = selectedDroneId;
  const camModeRef = useRef<CameraPerspective>(camMode);
  camModeRef.current = camMode;

  const showBubblesRef = useRef(showBubbles);
  showBubblesRef.current = showBubbles;
  const showTrailsRef = useRef(showTrails);
  showTrailsRef.current = showTrails;
  const showDetectionsRef = useRef(showDetections);
  showDetectionsRef.current = showDetections;
  const showGridRef = useRef(showGrid);
  showGridRef.current = showGrid;
  const showLidarRef = useRef(showLidar);
  showLidarRef.current = showLidar;
  const showRfMeshRef = useRef(showRfMesh);
  showRfMeshRef.current = showRfMesh;
  const showRadarThreatRef = useRef(showRadarThreat);
  showRadarThreatRef.current = showRadarThreat;
  const fbwActiveRef = useRef(fbwActive);
  fbwActiveRef.current = fbwActive;

  // Toggle browser fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(console.warn);
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(console.warn);
      setIsFullscreen(false);
    }
  }, []);

  // Fly-By-Wire Manual Flight Keys (W/S/A/D/Q/E/Space/Shift)
  useEffect(() => {
    if (!fbwActive) return;

    const handleFbwKeyDown = (e: KeyboardEvent) => {
      const drone = dronesRef.current.find(d => d.drone_id === selectedDroneIdRef.current);
      if (!drone) return;

      const step = 4.0; // 4 meters nudge
      const [x, y, z] = geoToCartesian(drone.lat, drone.lon, drone.alt);
      const yawRad = THREE.MathUtils.degToRad(-drone.orientation.yaw);

      let newX = x;
      let newY = y;
      let newZ = z;

      if (e.code === 'KeyW') {
        newX += Math.sin(yawRad) * step;
        newZ += Math.cos(yawRad) * step;
      } else if (e.code === 'KeyS') {
        newX -= Math.sin(yawRad) * step;
        newZ -= Math.cos(yawRad) * step;
      } else if (e.code === 'KeyA') {
        newX -= Math.cos(yawRad) * step;
        newZ += Math.sin(yawRad) * step;
      } else if (e.code === 'KeyD') {
        newX += Math.cos(yawRad) * step;
        newZ -= Math.sin(yawRad) * step;
      } else if (e.code === 'Space') {
        newY = Math.min(100, newY + 2.5);
      } else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        newY = Math.max(5, newY - 2.5);
      } else {
        return;
      }

      e.preventDefault();
      const [lat, lon] = cartesianToGeo(newX, newZ);
      fetch(`/api/v1/drones/${drone.drone_id}/goto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon, alt: newY, speed_ms: 8.0 }),
      }).catch(console.warn);
      tacticalAudio.playButtonBeep();
    };

    window.addEventListener('keydown', handleFbwKeyDown);
    return () => window.removeEventListener('keydown', handleFbwKeyDown);
  }, [fbwActive]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // -------------------------------------------------------------
    // 1. SCENE & RENDERER SETUP
    // -------------------------------------------------------------
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050811);
    scene.fog = new THREE.FogExp2(0x050811, 0.0028);

    const camera = new THREE.PerspectiveCamera(
      52,
      container.clientWidth / container.clientHeight,
      0.5,
      2500
    );
    camera.position.set(0, 85, 135);
    camera.lookAt(0, 15, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);

    // -------------------------------------------------------------
    // 2. TACTICAL LIGHTING
    // -------------------------------------------------------------
    const ambientLight = new THREE.AmbientLight(0xdbeafe, 0.9);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x38bdf8, 2.2);
    dirLight.position.set(80, 200, 60);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);

    const basePointLight = new THREE.PointLight(0x06b6d4, 3, 120);
    basePointLight.position.set(0, 10, 0);
    scene.add(basePointLight);

    // -------------------------------------------------------------
    // 3. TACTICAL ENVIRONMENT & GROUND TERRAIN
    // -------------------------------------------------------------
    const envGroup = new THREE.Group();
    scene.add(envGroup);

    // Tactical Ground Plane with Dark Carbon Texture
    const groundGeo = new THREE.PlaneGeometry(600, 600, 40, 40);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x070c18,
      roughness: 0.85,
      metalness: 0.15,
    });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = -0.05;
    groundMesh.receiveShadow = true;
    envGroup.add(groundMesh);

    // Primary & Minor MGRS Grid
    const majorGrid = new THREE.GridHelper(500, 20, 0x0284c7, 0x0f172a);
    majorGrid.position.y = 0.02;
    envGroup.add(majorGrid);

    const minorGrid = new THREE.GridHelper(500, 100, 0x0369a1, 0x090f1d);
    minorGrid.position.y = 0.01;
    (minorGrid.material as THREE.Material).opacity = 0.45;
    (minorGrid.material as THREE.Material).transparent = true;
    envGroup.add(minorGrid);

    // Concentric Range Rings (25m, 50m, 100m, 150m, 200m)
    const ringRadii = [25, 50, 100, 150, 200];
    ringRadii.forEach(r => {
      const ringGeo = new THREE.RingGeometry(r - 0.25, r + 0.25, 96);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x06b6d4,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: r === 50 || r === 100 ? 0.35 : 0.18,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.06;
      envGroup.add(ring);
    });

    // Cardinal Axes Indicators (North, South, East, West)
    const axisMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.6 });
    const northPoints = [new THREE.Vector3(0, 0.08, 0), new THREE.Vector3(0, 0.08, -220)];
    const northLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(northPoints), axisMat);
    envGroup.add(northLine);

    const northArrow = new THREE.Mesh(new THREE.ConeGeometry(2.5, 6, 8), new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
    northArrow.position.set(0, 0.2, -225);
    northArrow.rotation.x = -Math.PI / 2;
    envGroup.add(northArrow);

    // -------------------------------------------------------------
    // Base Station Launch Pad (Octagonal Helipad with illuminated 'H')
    // -------------------------------------------------------------
    const padGroup = new THREE.Group();
    const padBase = new THREE.Mesh(
      new THREE.CylinderGeometry(8, 8.5, 0.4, 8),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8, roughness: 0.3 })
    );
    padBase.position.y = 0.2;
    padGroup.add(padBase);

    // Hazard Border Ring
    const padRing = new THREE.Mesh(
      new THREE.RingGeometry(7.2, 7.8, 32),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide, transparent: true, opacity: 0.7 })
    );
    padRing.rotation.x = -Math.PI / 2;
    padRing.position.y = 0.42;
    padGroup.add(padRing);

    // Helipad "H" Marking
    const hBarMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const hBarLeft = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 4.0), hBarMat);
    hBarLeft.position.set(-1.4, 0.43, 0);
    padGroup.add(hBarLeft);
    const hBarRight = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 4.0), hBarMat);
    hBarRight.position.set(1.4, 0.43, 0);
    padGroup.add(hBarRight);
    const hBarCross = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.02, 0.6), hBarMat);
    hBarCross.position.set(0, 0.43, 0);
    padGroup.add(hBarCross);

    // Telemetry Antenna Mast
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 9, 8), new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.9 }));
    mast.position.set(-7.5, 4.5, -7.5);
    padGroup.add(mast);

    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), new THREE.MeshBasicMaterial({ color: 0xf43f5e }));
    beacon.position.set(-7.5, 9.2, -7.5);
    padGroup.add(beacon);
    envGroup.add(padGroup);

    // -------------------------------------------------------------
    // 4. LIVE LiDAR SLAM POINT CLOUD (PHOTOGRAMMETRY HEATMAP)
    // -------------------------------------------------------------
    const lidarGroup = new THREE.Group();
    scene.add(lidarGroup);

    const maxLidar = 30000;
    const lidarPositions = new Float32Array(maxLidar * 3);
    const lidarColors = new Float32Array(maxLidar * 3);
    let curLidarIdx = 0;

    // Pre-populate with realistic topographic terrain scans
    for (let i = 0; i < 6000; i++) {
      const rx = (Math.random() - 0.5) * 260;
      const rz = (Math.random() - 0.5) * 260;
      const elevation = Math.max(0, Math.sin(rx * 0.04) * Math.cos(rz * 0.04) * 4.5 + (Math.random() * 0.8));

      lidarPositions[i * 3] = rx;
      lidarPositions[i * 3 + 1] = elevation;
      lidarPositions[i * 3 + 2] = rz;

      // Color gradient by elevation (Green -> Cyan -> Amber -> Crimson)
      if (elevation < 1.0) {
        lidarColors[i * 3] = 0.06; lidarColors[i * 3 + 1] = 0.72; lidarColors[i * 3 + 2] = 0.5;
      } else if (elevation < 3.0) {
        lidarColors[i * 3] = 0.02; lidarColors[i * 3 + 1] = 0.52; lidarColors[i * 3 + 2] = 0.85;
      } else {
        lidarColors[i * 3] = 0.96; lidarColors[i * 3 + 1] = 0.62; lidarColors[i * 3 + 2] = 0.04;
      }
    }
    curLidarIdx = 6000;

    const lidarGeo = new THREE.BufferGeometry();
    lidarGeo.setAttribute('position', new THREE.BufferAttribute(lidarPositions, 3));
    lidarGeo.setAttribute('color', new THREE.BufferAttribute(lidarColors, 3));

    const lidarMat = new THREE.PointsMaterial({
      size: 1.6,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
    });
    const lidarPointsMesh = new THREE.Points(lidarGeo, lidarMat);
    lidarGroup.add(lidarPointsMesh);

    // -------------------------------------------------------------
    // 5. 3D RF MESH NETWORK LINKS & FRESNEL ZONE ELLIPSOID
    // -------------------------------------------------------------
    const rfMeshGroup = new THREE.Group();
    scene.add(rfMeshGroup);

    // Base to Drone line
    const baseRfLineMat = new THREE.LineDashedMaterial({
      color: 0x06b6d4,
      dashSize: 2.0,
      gapSize: 1.5,
      transparent: true,
      opacity: 0.85,
    });
    const baseRfLines: THREE.Line[] = [];
    for (let i = 0; i < 3; i++) {
      const line = new THREE.Line(new THREE.BufferGeometry(), baseRfLineMat.clone());
      rfMeshGroup.add(line);
      baseRfLines.push(line);
    }

    // Inter-drone mesh lines (3 links)
    const interMeshLineMat = new THREE.LineDashedMaterial({
      color: 0x10b981,
      dashSize: 2.0,
      gapSize: 1.2,
      transparent: true,
      opacity: 0.75,
    });
    const interMeshLines: THREE.Line[] = [];
    for (let i = 0; i < 3; i++) {
      const line = new THREE.Line(new THREE.BufferGeometry(), interMeshLineMat.clone());
      rfMeshGroup.add(line);
      interMeshLines.push(line);
    }

    // 3D Fresnel Zone Ellipsoid (between antenna and ARES-01 leader)
    const fresnelGeo = new THREE.SphereGeometry(1, 24, 16);
    const fresnelMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.18,
    });
    const fresnelMesh = new THREE.Mesh(fresnelGeo, fresnelMat);
    fresnelMesh.visible = false;
    rfMeshGroup.add(fresnelMesh);

    // -------------------------------------------------------------
    // 6. RADAR THREAT DOME (ELECTRONIC WARFARE SANDBOX)
    // -------------------------------------------------------------
    const threatGroup = new THREE.Group();
    scene.add(threatGroup);

    const threatDomeGeo = new THREE.SphereGeometry(85, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const threatDomeMat = new THREE.MeshBasicMaterial({
      color: 0xf43f5e,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
    });
    const threatDome = new THREE.Mesh(threatDomeGeo, threatDomeMat);
    threatDome.position.set(115, 0, -115);
    threatGroup.add(threatDome);

    const threatWire = new THREE.LineSegments(
      new THREE.WireframeGeometry(threatDomeGeo),
      new THREE.LineBasicMaterial({ color: 0xf43f5e, transparent: true, opacity: 0.35 })
    );
    threatWire.position.set(115, 0, -115);
    threatGroup.add(threatWire);

    // Rotating Radar Sweep Ring inside Threat Dome
    const threatSweepGeo = new THREE.RingGeometry(0, 85, 32, 1, 0, Math.PI / 3);
    const threatSweepMat = new THREE.MeshBasicMaterial({
      color: 0xf43f5e,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.25,
    });
    const threatSweep = new THREE.Mesh(threatSweepGeo, threatSweepMat);
    threatSweep.rotation.x = -Math.PI / 2;
    threatSweep.position.set(115, 0.2, -115);
    threatGroup.add(threatSweep);

    // -------------------------------------------------------------
    // 7. GROUND RESCUE UNITS (ATAK CoT TROOPS)
    // -------------------------------------------------------------
    const groundUnitsGroup = new THREE.Group();
    scene.add(groundUnitsGroup);

    // ATAK Troop Badges
    const createTroopMarker = (name: string, colorHex: number) => {
      const troopGrp = new THREE.Group();
      const baseMarker = new THREE.Mesh(
        new THREE.CylinderGeometry(1.6, 2.0, 0.8, 6),
        new THREE.MeshStandardMaterial({ color: colorHex, metalness: 0.9 })
      );
      troopGrp.add(baseMarker);

      const beaconBeam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.15, 12),
        new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.5 })
      );
      beaconBeam.position.y = 6;
      troopGrp.add(beaconBeam);

      // Canvas Badge
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 70;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'rgba(11, 18, 32, 0.9)';
        ctx.roundRect ? ctx.roundRect(4, 4, 248, 62, 8) : ctx.rect(4, 4, 248, 62);
        ctx.fill();
        ctx.strokeStyle = name.includes('SAR') ? '#10b981' : '#38bdf8';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px monospace';
        ctx.fillText(`🪖 ${name}`, 12, 30);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px sans-serif';
        ctx.fillText('ATAK CoT ACTIVO • TERRESTRE', 12, 52);
      }
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true }));
      sprite.scale.set(10, 3, 1);
      sprite.position.set(0, 14, 0);
      troopGrp.add(sprite);

      return troopGrp;
    };

    const troopAlfa = createTroopMarker('RESCATE-ALFA', 0x10b981);
    troopAlfa.position.set(-25, 0.4, 25);
    groundUnitsGroup.add(troopAlfa);

    const troopMedico = createTroopMarker('MEDICO-01', 0x38bdf8);
    troopMedico.position.set(-15, 0.4, -30);
    groundUnitsGroup.add(troopMedico);

    // Ground path line to survivor
    const groundPathMat = new THREE.LineDashedMaterial({
      color: 0x10b981,
      dashSize: 2.0,
      gapSize: 1.0,
      transparent: true,
      opacity: 0.9,
    });
    const groundPathLine = new THREE.Line(new THREE.BufferGeometry(), groundPathMat);
    groundPathLine.visible = false;
    groundUnitsGroup.add(groundPathLine);

    // -------------------------------------------------------------
    // 8. INTERACTIVE GOTO 3D BEACON & TRAJECTORY SPLINE
    // -------------------------------------------------------------
    const gotoBeaconGroup = new THREE.Group();
    gotoBeaconGroup.visible = false;
    scene.add(gotoBeaconGroup);

    const gotoRing = new THREE.Mesh(
      new THREE.RingGeometry(2.5, 3.2, 32),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide, transparent: true, opacity: 0.8 })
    );
    gotoRing.rotation.x = -Math.PI / 2;
    gotoRing.position.y = 0.15;
    gotoBeaconGroup.add(gotoRing);

    const gotoBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 1.2, 35, 16),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.35 })
    );
    gotoBeam.position.y = 17.5;
    gotoBeaconGroup.add(gotoBeam);

    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.6),
      new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xf59e0b, emissiveIntensity: 0.8, metalness: 0.9 })
    );
    diamond.position.y = 35;
    gotoBeaconGroup.add(diamond);

    const trajLineMat = new THREE.LineDashedMaterial({
      color: 0xf59e0b,
      dashSize: 2.0,
      gapSize: 1.0,
      transparent: true,
      opacity: 0.85,
    });
    const trajLine = new THREE.Line(new THREE.BufferGeometry(), trajLineMat);
    trajLine.visible = false;
    scene.add(trajLine);

    const conflictLaserMat = new THREE.LineBasicMaterial({
      color: 0xf43f5e,
      linewidth: 3,
      transparent: true,
      opacity: 0.9,
    });
    const conflictLaser = new THREE.Line(new THREE.BufferGeometry(), conflictLaserMat);
    conflictLaser.visible = false;
    scene.add(conflictLaser);

    // -------------------------------------------------------------
    // 9. DRONE 3D MODEL FACTORY & CACHE
    // -------------------------------------------------------------
    interface Drone3DObject {
      group: THREE.Group;
      fuselage: THREE.Mesh;
      rotors: THREE.Mesh[];
      strobeLight: THREE.PointLight;
      strobeMesh: THREE.Mesh;
      gimbalGroup: THREE.Group;
      bubble: THREE.Mesh;
      bubbleWire: THREE.LineSegments;
      dropLine: THREE.Line;
      dropShadow: THREE.Mesh;
      groundPulse: THREE.Mesh;
      reticle: THREE.Group;
      badgeSprite: THREE.Sprite;
      trailLine: THREE.Line;
      trailPositions: THREE.Vector3[];
      hitBox: THREE.Mesh;
    }

    const droneObjects: Map<string, Drone3DObject> = new Map();
    const droneInteractiveMeshes: THREE.Object3D[] = [];

    const createBadgeTexture = (callsign: string, alt: number, speed: number, bat: number, state: string) => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'rgba(11, 18, 32, 0.85)';
        ctx.roundRect ? ctx.roundRect(4, 4, 248, 92, 12) : ctx.rect(4, 4, 248, 92);
        ctx.fill();

        ctx.strokeStyle = callsign === 'ARES-01' ? '#06b6d4' : callsign === 'ARES-02' ? '#10b981' : '#a855f7';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px monospace';
        ctx.fillText(callsign, 16, 32);

        ctx.fillStyle = state === 'IN_FLIGHT' ? '#10b981' : '#f59e0b';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(state, 150, 32);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(16, 42);
        ctx.lineTo(240, 42);
        ctx.stroke();

        ctx.fillStyle = '#94a3b8';
        ctx.font = '14px monospace';
        ctx.fillText(`ALT:`, 16, 64);
        ctx.fillStyle = '#38bdf8';
        ctx.fillText(`${alt.toFixed(1)}m`, 52, 64);

        ctx.fillStyle = '#94a3b8';
        ctx.fillText(`VEL:`, 130, 64);
        ctx.fillStyle = '#38bdf8';
        ctx.fillText(`${speed.toFixed(1)}m/s`, 166, 64);

        ctx.fillStyle = '#94a3b8';
        ctx.fillText(`BAT:`, 16, 86);
        ctx.fillStyle = bat < 25 ? '#f43f5e' : bat < 50 ? '#f59e0b' : '#34d399';
        ctx.fillText(`${bat.toFixed(0)}%`, 52, 86);
      }
      return new THREE.CanvasTexture(canvas);
    };

    const getOrCreateDrone3D = (droneId: string): Drone3DObject => {
      if (droneObjects.has(droneId)) return droneObjects.get(droneId)!;

      const group = new THREE.Group();
      const accentHex = droneId === 'ARES-01' ? 0x06b6d4 : droneId === 'ARES-02' ? 0x10b981 : 0xa855f7;

      // 1. Carbon Frame
      const fuselage = new THREE.Mesh(
        new THREE.CylinderGeometry(1.6, 2.0, 0.7, 6),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.85, roughness: 0.25 })
      );
      fuselage.castShadow = true;
      group.add(fuselage);

      const shell = new THREE.Mesh(
        new THREE.ConeGeometry(1.5, 0.5, 6),
        new THREE.MeshStandardMaterial({ color: accentHex, emissive: accentHex, emissiveIntensity: 0.35, metalness: 0.7 })
      );
      shell.position.y = 0.55;
      group.add(shell);

      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.6, 4), new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.9 }));
      nose.rotation.x = -Math.PI / 2;
      nose.position.set(0, 0.1, 1.8);
      group.add(nose);

      // 2. Gimbal Camera
      const gimbalGroup = new THREE.Group();
      gimbalGroup.position.set(0, -0.4, 1.2);
      gimbalGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), new THREE.MeshStandardMaterial({ color: 0x090d16, metalness: 0.95 })));
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.3, 16), new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
      lens.rotation.x = Math.PI / 2;
      lens.position.z = 0.35;
      gimbalGroup.add(lens);
      group.add(gimbalGroup);

      // 3. Carbon Arms & Motor Pods
      const rotors: THREE.Mesh[] = [];
      const armAngles = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
      const armRadius = 2.4;

      armAngles.forEach((angle, idx) => {
        const dx = Math.sin(angle) * armRadius;
        const dz = Math.cos(angle) * armRadius;
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, armRadius * 1.05), new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.9 }));
        arm.position.set(dx * 0.5, 0.05, dz * 0.5);
        arm.rotation.z = Math.PI / 2;
        arm.rotation.y = angle;
        group.add(arm);

        const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.5, 12), new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9 }));
        motor.position.set(dx, 0.2, dz);
        group.add(motor);

        const skidLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.2), new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.9 }));
        skidLeg.position.set(dx * 0.8, -0.6, dz * 0.8);
        group.add(skidLeg);

        const rotorDisc = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.04, 24), new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.5 }));
        rotorDisc.position.set(dx, 0.45, dz);
        group.add(rotorDisc);
        rotors.push(rotorDisc);

        if (idx === 0) {
          const greenLed = new THREE.Mesh(new THREE.SphereGeometry(0.15), new THREE.MeshBasicMaterial({ color: 0x10b981 }));
          greenLed.position.set(dx * 1.1, 0.3, dz * 1.1);
          group.add(greenLed);
        } else if (idx === 1) {
          const redLed = new THREE.Mesh(new THREE.SphereGeometry(0.15), new THREE.MeshBasicMaterial({ color: 0xf43f5e }));
          redLed.position.set(dx * 1.1, 0.3, dz * 1.1);
          group.add(redLed);
        }
      });

      // Tail Strobe
      const strobeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      strobeMesh.position.set(0, 0.4, -2.0);
      group.add(strobeMesh);

      const strobeLight = new THREE.PointLight(0xffffff, 2, 25);
      strobeLight.position.set(0, 0.4, -2.0);
      group.add(strobeLight);

      // 4. Tactical 15m Forcefield Bubble
      const bubbleGeo = new THREE.SphereGeometry(15, 32, 24);
      const bubble = new THREE.Mesh(bubbleGeo, new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.09, depthWrite: false }));
      group.add(bubble);

      const bubbleWire = new THREE.LineSegments(new THREE.WireframeGeometry(bubbleGeo), new THREE.LineBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.22 }));
      group.add(bubbleWire);

      // 5. Altitude Drop Line & Shadow
      const dropLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -30, 0)]),
        new THREE.LineDashedMaterial({ color: 0x38bdf8, dashSize: 1.5, gapSize: 1.0, transparent: true, opacity: 0.55 })
      );
      scene.add(dropLine);

      const dropShadow = new THREE.Mesh(new THREE.CircleGeometry(2.5, 32), new THREE.MeshBasicMaterial({ color: 0x0284c7, transparent: true, opacity: 0.35 }));
      dropShadow.rotation.x = -Math.PI / 2;
      dropShadow.position.y = 0.08;
      scene.add(dropShadow);

      const groundPulse = new THREE.Mesh(new THREE.RingGeometry(2.8, 3.2, 32), new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.4 }));
      groundPulse.rotation.x = -Math.PI / 2;
      groundPulse.position.y = 0.09;
      scene.add(groundPulse);

      // 6. Reticle
      const reticle = new THREE.Group();
      reticle.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(4.8, 2.2, 4.8)), new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85 })));
      reticle.visible = false;
      group.add(reticle);

      // 7. Billboard Badge
      const badgeSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: createBadgeTexture(droneId, 30.0, 7.0, 85, 'IN_FLIGHT'), transparent: true }));
      badgeSprite.scale.set(10, 4, 1);
      badgeSprite.position.set(0, 5.2, 0);
      group.add(badgeSprite);

      // 8. Flight Trail
      const trailPositions: THREE.Vector3[] = [];
      const trailLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: accentHex, transparent: true, opacity: 0.6 }));
      scene.add(trailLine);

      // 9. Raycasting HitBox
      const hitBox = new THREE.Mesh(new THREE.SphereGeometry(4.0, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
      hitBox.userData = { droneId };
      group.add(hitBox);
      droneInteractiveMeshes.push(hitBox);

      scene.add(group);

      const d3d: Drone3DObject = {
        group,
        fuselage,
        rotors,
        strobeLight,
        strobeMesh,
        gimbalGroup,
        bubble,
        bubbleWire,
        dropLine,
        dropShadow,
        groundPulse,
        reticle,
        badgeSprite,
        trailLine,
        trailPositions,
        hitBox,
      };

      droneObjects.set(droneId, d3d);
      return d3d;
    };

    // -------------------------------------------------------------
    // 10. D-FINE 3D TARGET HOLOGRAMS CACHE
    // -------------------------------------------------------------
    interface Detection3DObject {
      group: THREE.Group;
      beaconMesh: THREE.Mesh;
      ringMesh: THREE.Mesh;
      sprite: THREE.Sprite;
    }
    const detectionObjects: Map<string, Detection3DObject> = new Map();

    const updateDetections3D = () => {
      if (!showDetectionsRef.current) {
        detectionObjects.forEach(d => { d.group.visible = false; });
        return;
      }

      const activeDets = detectionsRef.current;
      activeDets.forEach(det => {
        let d3d = detectionObjects.get(det.detection_id);
        const [x, y, z] = geoToCartesian(det.lat, det.lon, det.alt || 0);

        if (!d3d) {
          const group = new THREE.Group();
          group.position.set(x, 0, z);

          const isSurvivor = det.target_class === 'SURVIVOR';
          const isFire = det.target_class === 'FIRE_HAZARD';
          const colorHex = isSurvivor ? 0x10b981 : isFire ? 0xf97316 : 0xfbbf24;

          const beamMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.3, isFire ? 14 : 0.8, isFire ? 25 : 45, 16),
            new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: isFire ? 0.35 : 0.45 })
          );
          beamMesh.position.y = isFire ? 12.5 : 22.5;
          group.add(beamMesh);

          const radius = isFire ? 14 : 4;
          const ringMesh = new THREE.Mesh(
            new THREE.RingGeometry(radius - 0.3, radius + 0.3, 32),
            new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide, transparent: true, opacity: 0.7 })
          );
          ringMesh.rotation.x = -Math.PI / 2;
          ringMesh.position.y = 0.12;
          group.add(ringMesh);

          // Badge
          const canvas = document.createElement('canvas');
          canvas.width = 256;
          canvas.height = 70;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
            ctx.roundRect ? ctx.roundRect(4, 4, 248, 62, 8) : ctx.rect(4, 4, 248, 62);
            ctx.fill();
            ctx.strokeStyle = isSurvivor ? '#10b981' : isFire ? '#f97316' : '#fbbf24';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 15px monospace';
            const title = isSurvivor ? '👤 SOBREVIVIENTE (D-FINE)' : isFire ? '🔥 EXCLUSIÓN TÉRMICA 28m' : '🎯 OBJETO TÁCTICO';
            ctx.fillText(title, 12, 28);
            ctx.fillStyle = isSurvivor ? '#34d399' : '#fed7aa';
            ctx.font = '12px sans-serif';
            ctx.fillText(`CONF: ${(det.confidence * 100).toFixed(1)}% | DRON: ${det.drone_id}`, 12, 50);
          }
          const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true }));
          sprite.scale.set(12, 3.5, 1);
          sprite.position.set(0, isFire ? 18 : 28, 0);
          group.add(sprite);

          scene.add(group);
          d3d = { group, beaconMesh: beamMesh, ringMesh, sprite };
          detectionObjects.set(det.detection_id, d3d);
        } else {
          d3d.group.visible = true;
          d3d.group.position.set(x, 0, z);
        }
      });
    };

    // -------------------------------------------------------------
    // 11. ORBIT CONTROLS & INTERACTION HANDLERS
    // -------------------------------------------------------------
    let isDragging = false;
    let isRightDrag = false;
    let prevMouseX = 0;
    let prevMouseY = 0;
    let azimuth = 0.55;
    let elevation = 0.65;
    let distance = 145;
    let targetLookAt = new THREE.Vector3(0, 15, 0);

    const onMouseDown = (e: MouseEvent) => {
      if (gotoModeRef.current && e.button === 0) {
        handleGotoClick(e);
        return;
      }

      if (e.button === 0) {
        const rect = dom.getBoundingClientRect();
        const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);
        const intersects = raycaster.intersectObjects(droneInteractiveMeshes);
        if (intersects.length > 0) {
          const hitDroneId = intersects[0].object.userData.droneId;
          if (hitDroneId) {
            setSelectedDroneId(hitDroneId);
            tacticalAudio.playLockOn();
            tacticalVoice.speak(`Dron táctico ${hitDroneId} seleccionado`, 'select', true);
            return;
          }
        }
      }

      isDragging = true;
      isRightDrag = e.button === 2 || e.shiftKey;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = dom.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);
      const groundHits = raycaster.intersectObject(groundMesh);

      if (groundHits.length > 0) {
        const pt = groundHits[0].point;
        const [lat, lon] = cartesianToGeo(pt.x, pt.z);
        const curDrone = dronesRef.current.find(d => d.drone_id === selectedDroneIdRef.current);
        const droneCoords = curDrone ? geoToCartesian(curDrone.lat, curDrone.lon, curDrone.alt) : [0, 0, 0];
        const distToDrone = Math.hypot(pt.x - droneCoords[0], pt.z - droneCoords[2]);

        setHoveredCoords({ x: pt.x, z: pt.z, lat, lon, dist: distToDrone });

        if (gotoModeRef.current) {
          gotoBeaconGroup.visible = true;
          gotoBeaconGroup.position.set(pt.x, 0, pt.z);
          dom.style.cursor = 'crosshair';
        } else {
          dom.style.cursor = isDragging ? 'grabbing' : 'grab';
        }
      }

      if (!isDragging) return;
      const dx = e.clientX - prevMouseX;
      const dy = e.clientY - prevMouseY;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;

      if (isRightDrag) {
        const right = new THREE.Vector3();
        camera.getWorldDirection(right);
        right.cross(camera.up).normalize();
        targetLookAt.addScaledVector(right, -dx * 0.18);
        targetLookAt.y += dy * 0.18;
      } else {
        azimuth -= dx * 0.0055;
        elevation = Math.max(0.08, Math.min(Math.PI / 2 - 0.04, elevation + dy * 0.0055));
      }
    };

    const onMouseUp = () => { isDragging = false; };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      distance = Math.max(15, Math.min(650, distance + e.deltaY * 0.14));
    };

    const handleGotoClick = (e: MouseEvent) => {
      const rect = dom.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);
      const groundHits = raycaster.intersectObject(groundMesh);

      if (groundHits.length > 0) {
        const pt = groundHits[0].point;
        const [lat, lon] = cartesianToGeo(pt.x, pt.z);
        setActiveDestination({ x: pt.x, z: pt.z, lat, lon });
        tacticalAudio.playLockOn();

        if (onTargetDesignatedRef.current) {
          onTargetDesignatedRef.current(lat, lon);
        }
      }
    };

    const dom = renderer.domElement;
    dom.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    dom.addEventListener('wheel', onWheel, { passive: false });
    dom.addEventListener('contextmenu', e => e.preventDefault());

    // -------------------------------------------------------------
    // 12. ANIMATION LOOP (60 FPS)
    // -------------------------------------------------------------
    let animId: number;
    const clock = new THREE.Clock();
    let badgeUpdateTimer = 0;
    let rfDashOffset = 0;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const time = clock.getElapsedTime();
      badgeUpdateTimer += delta;
      rfDashOffset += delta * 15;

      const currentDrones = dronesRef.current;
      const activeSelectedId = selectedDroneIdRef.current;
      const curSelectedDrone = currentDrones.find(d => d.drone_id === activeSelectedId);

      // Toggles
      envGroup.visible = showGridRef.current;
      lidarGroup.visible = showLidarRef.current;
      rfMeshGroup.visible = showRfMeshRef.current;
      threatGroup.visible = showRadarThreatRef.current;

      // Rotate radar sweep inside threat dome
      threatSweep.rotation.z += delta * 1.8;

      // Check radar threat exposure
      if (showRadarThreatRef.current && curSelectedDrone) {
        const [dx, dy, dz] = geoToCartesian(curSelectedDrone.lat, curSelectedDrone.lon, curSelectedDrone.alt);
        const distToThreat = Math.hypot(dx - 115, dz - (-115));
        if (distToThreat < 85) {
          if (dy > 22) {
            setRadarStatusMsg(`⚠️ ${curSelectedDrone.drone_id} DETECTADO POR RADAR EW (+${dy.toFixed(0)}m)`);
          } else {
            setRadarStatusMsg(`✅ ${curSelectedDrone.drone_id} ENMASCARADO POR RELIEVE (SIGILO)`);
          }
        } else {
          setRadarStatusMsg(null);
        }
      }

      // Camera Perspective
      const mode = camModeRef.current;
      if (mode === 'orbit') {
        const cx = targetLookAt.x + distance * Math.cos(elevation) * Math.sin(azimuth);
        const cy = targetLookAt.y + distance * Math.sin(elevation);
        const cz = targetLookAt.z + distance * Math.cos(elevation) * Math.cos(azimuth);
        camera.position.lerp(new THREE.Vector3(cx, cy, cz), 0.12);
        camera.lookAt(targetLookAt);
      } else if (mode === 'chase' && curSelectedDrone) {
        const [dx, dy, dz] = geoToCartesian(curSelectedDrone.lat, curSelectedDrone.lon, curSelectedDrone.alt);
        const yawRad = THREE.MathUtils.degToRad(-curSelectedDrone.orientation.yaw);
        const offsetX = -Math.sin(yawRad) * 22;
        const offsetZ = -Math.cos(yawRad) * 22;
        camera.position.lerp(new THREE.Vector3(dx + offsetX, dy + 7, dz + offsetZ), 0.1);
        camera.lookAt(dx, dy + 2, dz);
      } else if (mode === 'top_down') {
        const focusX = curSelectedDrone ? geoToCartesian(curSelectedDrone.lat, curSelectedDrone.lon, curSelectedDrone.alt)[0] : 0;
        const focusZ = curSelectedDrone ? geoToCartesian(curSelectedDrone.lat, curSelectedDrone.lon, curSelectedDrone.alt)[2] : 0;
        camera.position.lerp(new THREE.Vector3(focusX, 175, focusZ + 0.1), 0.08);
        camera.lookAt(focusX, 0, focusZ);
      } else if (mode === 'base') {
        camera.position.lerp(new THREE.Vector3(0, 4, 18), 0.08);
        camera.lookAt(0, 35, -50);
      }

      beacon.material.opacity = Math.sin(time * 6) > 0 ? 1 : 0.3;

      if (gotoBeaconGroup.visible) {
        gotoRing.rotation.z += delta * 1.5;
        diamond.rotation.y += delta * 2.0;
        diamond.rotation.x = Math.sin(time * 3) * 0.2;
      }

      // Drone rendering & updates
      let conflictDroneA: [number, number, number] | null = null;
      let conflictDroneB: [number, number, number] | null = null;
      const droneCartesians: THREE.Vector3[] = [];

      currentDrones.forEach(drone => {
        const d3d = getOrCreateDrone3D(drone.drone_id);
        const [x, y, z] = geoToCartesian(drone.lat, drone.lon, drone.alt);
        droneCartesians.push(new THREE.Vector3(x, y, z));

        d3d.group.position.set(x, y, z);
        d3d.group.rotation.set(
          THREE.MathUtils.degToRad(drone.orientation.pitch),
          THREE.MathUtils.degToRad(-drone.orientation.yaw),
          THREE.MathUtils.degToRad(drone.orientation.roll)
        );

        d3d.rotors.forEach(r => { r.rotation.y += delta * 55; });

        const isStrobeOn = Math.sin(time * 16) > 0.65;
        d3d.strobeLight.intensity = isStrobeOn ? 3.0 : 0.1;
        (d3d.strobeMesh.material as THREE.MeshBasicMaterial).color.setHex(isStrobeOn ? 0xffffff : 0x334155);

        const ptz = ptzRef.current[drone.drone_id];
        if (ptz) {
          d3d.gimbalGroup.rotation.x = THREE.MathUtils.degToRad(ptz.pitch_deg || -45);
          d3d.gimbalGroup.rotation.y = THREE.MathUtils.degToRad(ptz.yaw_deg || 0);
        }

        const isSelected = drone.drone_id === activeSelectedId;
        d3d.reticle.visible = isSelected;
        if (isSelected) d3d.reticle.rotation.y += delta * 1.2;

        const linePos = d3d.dropLine.geometry.attributes.position as THREE.BufferAttribute;
        linePos.setXYZ(0, x, y, z);
        linePos.setXYZ(1, x, 0.1, z);
        linePos.needsUpdate = true;

        d3d.dropShadow.position.set(x, 0.08, z);
        const shadowScale = Math.max(0.6, 2.5 - drone.alt * 0.035);
        d3d.dropShadow.scale.set(shadowScale, shadowScale, 1);

        d3d.groundPulse.position.set(x, 0.09, z);
        const sonarCycle = (time * 1.2) % 1;
        d3d.groundPulse.scale.set(1 + sonarCycle * 2.5, 1 + sonarCycle * 2.5, 1);
        (d3d.groundPulse.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.5 * (1 - sonarCycle));

        // 15m Forcefield Bubble
        const isBreached = drone.in_safety_breach || (drone.nearest_distance_m !== null && (drone.nearest_distance_m ?? 999) < 15.0);
        d3d.bubble.visible = showBubblesRef.current;
        d3d.bubbleWire.visible = showBubblesRef.current;

        if (isBreached) {
          tacticalAudio.playCollisionAlarm();
          const pulse = (Math.sin(time * 14) + 1) / 2;
          (d3d.bubble.material as THREE.MeshBasicMaterial).color.setHex(0xf43f5e);
          (d3d.bubble.material as THREE.MeshBasicMaterial).opacity = 0.22 + pulse * 0.28;
          (d3d.bubbleWire.material as THREE.LineBasicMaterial).color.setHex(0xf43f5e);
          (d3d.bubbleWire.material as THREE.LineBasicMaterial).opacity = 0.6 + pulse * 0.4;

          if (!conflictDroneA) conflictDroneA = [x, y, z];
          else if (!conflictDroneB) conflictDroneB = [x, y, z];
        } else {
          (d3d.bubble.material as THREE.MeshBasicMaterial).color.setHex(0x06b6d4);
          (d3d.bubble.material as THREE.MeshBasicMaterial).opacity = 0.08;
          (d3d.bubbleWire.material as THREE.LineBasicMaterial).color.setHex(0x06b6d4);
          (d3d.bubbleWire.material as THREE.LineBasicMaterial).opacity = 0.22;
        }

        // 3D Flight Trail
        if (showTrailsRef.current) {
          d3d.trailLine.visible = true;
          d3d.trailPositions.push(new THREE.Vector3(x, y, z));
          if (d3d.trailPositions.length > 35) d3d.trailPositions.shift();
          d3d.trailLine.geometry.setFromPoints(d3d.trailPositions);
        } else {
          d3d.trailLine.visible = false;
        }

        // Real-time LiDAR point sampling
        if (showLidarRef.current && curLidarIdx < maxLidar - 10) {
          for (let k = 0; k < 3; k++) {
            const spread = (Math.random() - 0.5) * 16;
            const px = x + spread;
            const pz = z + spread;
            const py = Math.max(0, Math.sin(px * 0.04) * Math.cos(pz * 0.04) * 3.5 + Math.random() * 0.6);

            lidarPositions[curLidarIdx * 3] = px;
            lidarPositions[curLidarIdx * 3 + 1] = py;
            lidarPositions[curLidarIdx * 3 + 2] = pz;

            if (py < 1.0) {
              lidarColors[curLidarIdx * 3] = 0.06; lidarColors[curLidarIdx * 3 + 1] = 0.72; lidarColors[curLidarIdx * 3 + 2] = 0.5;
            } else if (py < 3.0) {
              lidarColors[curLidarIdx * 3] = 0.02; lidarColors[curLidarIdx * 3 + 1] = 0.52; lidarColors[curLidarIdx * 3 + 2] = 0.85;
            } else {
              lidarColors[curLidarIdx * 3] = 0.96; lidarColors[curLidarIdx * 3 + 1] = 0.62; lidarColors[curLidarIdx * 3 + 2] = 0.04;
            }
            curLidarIdx++;
          }
          lidarGeo.attributes.position.needsUpdate = true;
          lidarGeo.attributes.color.needsUpdate = true;
        }

        if (badgeUpdateTimer > 0.25) {
          d3d.badgeSprite.material.map?.dispose();
          d3d.badgeSprite.material.map = createBadgeTexture(drone.drone_id, drone.alt, drone.speed_ms, drone.battery, drone.fsm_state);
        }
      });

      if (badgeUpdateTimer > 0.25) {
        badgeUpdateTimer = 0;
        setLidarPointCount(curLidarIdx);
      }

      // Update 3D RF Mesh Network Links
      if (showRfMeshRef.current) {
        const baseAntennaPos = new THREE.Vector3(-7.5, 9.2, -7.5);
        droneCartesians.forEach((pos, idx) => {
          if (idx < baseRfLines.length) {
            const line = baseRfLines[idx];
            line.visible = true;
            line.geometry.setFromPoints([baseAntennaPos, pos]);
            line.computeLineDistances();
            const dist = baseAntennaPos.distanceTo(pos);
            const mat = line.material as THREE.LineDashedMaterial;
            (mat as any).dashOffset = -rfDashOffset;
            if (dist < 90) mat.color.setHex(0x06b6d4); // Strong
            else if (dist < 150) mat.color.setHex(0xf59e0b); // Medium
            else mat.color.setHex(0xf43f5e); // Weak
          }
        });

        // Inter-drone mesh links
        if (droneCartesians.length >= 2) {
          interMeshLines[0].visible = true;
          interMeshLines[0].geometry.setFromPoints([droneCartesians[0], droneCartesians[1]]);
          interMeshLines[0].computeLineDistances();
        }
        if (droneCartesians.length >= 3) {
          interMeshLines[1].visible = true;
          interMeshLines[1].geometry.setFromPoints([droneCartesians[1], droneCartesians[2]]);
          interMeshLines[1].computeLineDistances();

          interMeshLines[2].visible = true;
          interMeshLines[2].geometry.setFromPoints([droneCartesians[0], droneCartesians[2]]);
          interMeshLines[2].computeLineDistances();
        }

        // Fresnel Zone between Base and Leader Drone
        if (droneCartesians.length > 0) {
          fresnelMesh.visible = true;
          const leaderPos = droneCartesians[0];
          const mid = new THREE.Vector3().addVectors(baseAntennaPos, leaderPos).multiplyScalar(0.5);
          const linkDist = baseAntennaPos.distanceTo(leaderPos);
          fresnelMesh.position.copy(mid);
          fresnelMesh.scale.set(6.5, 6.5, linkDist * 0.5);
          fresnelMesh.lookAt(leaderPos);
        }
      }

      // Conflict Laser Beam
      if (conflictDroneA && conflictDroneB && showBubblesRef.current) {
        conflictLaser.visible = true;
        conflictLaser.geometry.setFromPoints([
          new THREE.Vector3(conflictDroneA[0], conflictDroneA[1], conflictDroneA[2]),
          new THREE.Vector3(conflictDroneB[0], conflictDroneB[1], conflictDroneB[2]),
        ]);
      } else {
        conflictLaser.visible = false;
      }

      // GOTO Trajectory Spline
      if (curSelectedDrone && activeDestination) {
        trajLine.visible = true;
        const [dx, dy, dz] = geoToCartesian(curSelectedDrone.lat, curSelectedDrone.lon, curSelectedDrone.alt);
        const curve = new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(dx, dy, dz),
          new THREE.Vector3((dx + activeDestination.x) / 2, Math.max(dy, 25), (dz + activeDestination.z) / 2),
          new THREE.Vector3(activeDestination.x, 0, activeDestination.z)
        );
        trajLine.geometry.setFromPoints(curve.getPoints(30));
        trajLine.computeLineDistances();
      } else {
        trajLine.visible = false;
      }

      // Ground Unit Dispatch Path to Survivor
      const dispatchedUnit = groundUnits.find(u => u.status === 'DISPATCHED');
      const survivorDet = detectionsRef.current.find(d => d.target_class === 'SURVIVOR');
      if (dispatchedUnit && survivorDet) {
        groundPathLine.visible = true;
        const [ux, , uz] = geoToCartesian(dispatchedUnit.lat, dispatchedUnit.lon, 0);
        const [sx, , sz] = geoToCartesian(survivorDet.lat, survivorDet.lon, 0);
        groundPathLine.geometry.setFromPoints([new THREE.Vector3(ux, 0.3, uz), new THREE.Vector3(sx, 0.3, sz)]);
        groundPathLine.computeLineDistances();
      } else {
        groundPathLine.visible = false;
      }

      updateDetections3D();
      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      dom.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      dom.removeEventListener('wheel', onWheel);
      renderer.dispose();
      if (container.contains(dom)) {
        container.removeChild(dom);
      }
    };
  }, []);

  return (
    <div 
      ref={containerRef}
      className={`relative w-full h-full bg-[#050811] rounded-2xl overflow-hidden border border-cyan-500/30 shadow-2xl select-none group ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none' : 'min-h-[540px]'
      }`}
    >
      {/* 3D Top Status Bar HUD */}
      <div className="absolute top-3 left-3 flex flex-wrap items-center gap-2 pointer-events-auto">
        <div className="bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-cyan-500/40 text-xs font-mono text-cyan-300 flex items-center space-x-2 shadow-lg">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
          <span className="font-extrabold tracking-wide">BIOSCAOUT 3D ESPACIO AÉREO</span>
          <span className="text-slate-500">|</span>
          <span className="text-emerald-400 font-bold">60 FPS</span>
          <span className="text-slate-500">|</span>
          <span className="text-sky-400 font-bold">LiDAR: {lidarPointCount.toLocaleString()} pts</span>
        </div>

        {/* Camera Perspective Mode Switcher */}
        <div className="bg-slate-900/90 backdrop-blur-md p-1 rounded-xl border border-slate-700/80 flex items-center space-x-1 shadow-lg text-xs">
          <button
            onClick={() => { setCamMode('orbit'); tacticalAudio.playButtonBeep(); }}
            className={`px-2.5 py-1 font-bold rounded-lg transition ${
              camMode === 'orbit' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Órbita
          </button>
          <button
            onClick={() => { setCamMode('chase'); tacticalAudio.playButtonBeep(); }}
            className={`px-2.5 py-1 font-bold rounded-lg transition flex items-center space-x-1 ${
              camMode === 'chase' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Seguir Dron</span>
          </button>
          <button
            onClick={() => { setCamMode('top_down'); tacticalAudio.playButtonBeep(); }}
            className={`px-2.5 py-1 font-bold rounded-lg transition ${
              camMode === 'top_down' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Cenital 3D
          </button>
          <button
            onClick={() => { setCamMode('base'); tacticalAudio.playButtonBeep(); }}
            className={`px-2.5 py-1 font-bold rounded-lg transition ${
              camMode === 'base' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Base
          </button>
        </div>

        {/* Manual Fly-By-Wire Toggle */}
        <button
          onClick={() => {
            const next = !fbwActive;
            setFbwActive(next);
            tacticalAudio.playLockOn();
            if (next) {
              tacticalVoice.speak('Modo Fly By Wire manual activado. Controles de vuelo asignados a teclado', 'fbw', true);
            } else {
              tacticalVoice.speak('Modo Fly By Wire desactivado. Piloto automático reanudado', 'fbw');
            }
          }}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border text-xs font-black transition shadow-lg ${
            fbwActive
              ? 'bg-rose-600 border-rose-400 text-white animate-pulse ring-2 ring-rose-400/50'
              : 'bg-slate-900/90 border-slate-700 text-slate-300 hover:text-white'
          }`}
          title="Toma el control manual del dron con las teclas W/A/S/D/Q/E/Espacio"
        >
          <Gamepad2 className="w-4 h-4 text-cyan-300" />
          <span>{fbwActive ? 'FBW MANUAL ACTIVO' : 'PILOTO FBW (P)'}</span>
        </button>
      </div>

      {/* Top Right HUD: Fullscreen & Layer Toggles */}
      <div className="absolute top-3 right-3 flex items-center space-x-2 pointer-events-auto">
        {/* GOTO 3D Dispatch Button */}
        <button
          onClick={onToggleGotoMode}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border text-xs font-black shadow-lg transition ${
            gotoMode
              ? 'bg-amber-500 border-amber-400 text-slate-950 animate-pulse ring-2 ring-amber-400/50'
              : 'bg-slate-900/90 border-amber-500/40 text-amber-300 hover:bg-slate-800'
          }`}
        >
          <MapPin className="w-4 h-4" />
          <span>{gotoMode ? 'CANCELAR GOTO 3D' : 'DESIGNAR GOTO 3D'}</span>
        </button>

        {/* Layer Toggles */}
        <div className="bg-slate-900/90 backdrop-blur-md p-1 rounded-xl border border-slate-700/80 flex items-center space-x-1 text-xs">
          <button
            onClick={() => setShowBubbles(!showBubbles)}
            className={`px-2 py-1 rounded-lg font-bold transition ${
              showBubbles ? 'bg-cyan-950 text-cyan-300 border border-cyan-700/60' : 'text-slate-500 hover:text-slate-300'
            }`}
            title="Burbujas de seguridad 15m"
          >
            15m
          </button>
          <button
            onClick={() => setShowLidar(!showLidar)}
            className={`px-2 py-1 rounded-lg font-bold transition ${
              showLidar ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60' : 'text-slate-500 hover:text-slate-300'
            }`}
            title="Nube de puntos LiDAR 3D en tiempo real"
          >
            LiDAR
          </button>
          <button
            onClick={() => setShowRfMesh(!showRfMesh)}
            className={`px-2 py-1 rounded-lg font-bold transition ${
              showRfMesh ? 'bg-sky-950 text-sky-300 border border-sky-700/60' : 'text-slate-500 hover:text-slate-300'
            }`}
            title="Red Mesh RF y Elipsoide de Fresnel"
          >
            RF Mesh
          </button>
          <button
            onClick={() => setShowRadarThreat(!showRadarThreat)}
            className={`px-2 py-1 rounded-lg font-bold transition ${
              showRadarThreat ? 'bg-rose-950 text-rose-300 border border-rose-700/60' : 'text-slate-500 hover:text-slate-300'
            }`}
            title="Domo de Amenaza de Radar EW"
          >
            Radar EW
          </button>
          <button
            onClick={() => setShowDetections(!showDetections)}
            className={`px-2 py-1 rounded-lg font-bold transition ${
              showDetections ? 'bg-cyan-950 text-cyan-300 border border-cyan-700/60' : 'text-slate-500 hover:text-slate-300'
            }`}
            title="Hologramas D-FINE"
          >
            D-FINE
          </button>
        </div>

        {/* Fullscreen Button */}
        <button
          onClick={toggleFullscreen}
          className="p-2 bg-slate-900/90 hover:bg-slate-800 rounded-xl border border-slate-700 text-slate-300 hover:text-white shadow-lg transition"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Radar Warning Banner (Top-Center) */}
      {radarStatusMsg && (
        <div className={`absolute top-14 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-xl border font-bold text-xs shadow-2xl flex items-center space-x-2 pointer-events-none ${
          radarStatusMsg.includes('DETECTADO') 
            ? 'bg-rose-950/90 border-rose-500 text-rose-200 animate-pulse' 
            : 'bg-emerald-950/90 border-emerald-500 text-emerald-200'
        }`}>
          <ShieldAlert className="w-4 h-4" />
          <span>{radarStatusMsg}</span>
        </div>
      )}

      {/* Fly-By-Wire Active Banner */}
      {fbwActive && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-rose-600/90 backdrop-blur-md px-5 py-2 rounded-2xl border border-rose-300 text-white font-black text-xs flex items-center space-x-3 shadow-2xl animate-bounce pointer-events-none">
          <Gamepad2 className="w-4 h-4 animate-spin" />
          <span>FLY-BY-WIRE MANUAL ACTIVO: USA [W/S/A/D] PARA GUIAR A {selectedDroneId} | [ESPACIO/SHIFT] ALTITUD</span>
        </div>
      )}

      {/* Floating Tactical Coordinate Readout (Bottom Center) */}
      {hoveredCoords && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur-md px-4 py-1.5 rounded-xl border border-cyan-500/30 text-xs font-mono text-slate-300 flex items-center space-x-3 pointer-events-none shadow-xl">
          <span className="text-cyan-400 font-bold flex items-center">
            <LocateFixed className="w-3.5 h-3.5 mr-1" />
            TERRENO 3D:
          </span>
          <span>LAT: <strong className="text-white">{hoveredCoords.lat.toFixed(6)}°</strong></span>
          <span>LON: <strong className="text-white">{hoveredCoords.lon.toFixed(6)}°</strong></span>
          <span className="text-slate-500">|</span>
          <span>DIST A {selectedDroneId}: <strong className="text-amber-300">{hoveredCoords.dist.toFixed(1)}m</strong></span>
        </div>
      )}

      {/* Bottom Left: Tactical Instructions */}
      <div className="absolute bottom-3 left-3 bg-slate-900/85 backdrop-blur-md p-2.5 rounded-xl border border-slate-700/70 text-[11px] text-slate-300 space-y-1 pointer-events-none shadow-lg">
        <div className="flex items-center space-x-1.5 text-cyan-300 font-bold">
          <Navigation className="w-3.5 h-3.5 text-cyan-400" />
          <span>CONTROLES BIOSCAOUT 3D</span>
        </div>
        <div>🖱️ <strong>Click en Dron:</strong> Seleccionar unidad</div>
        <div>📍 <strong>Designar GOTO:</strong> Click en suelo (modo activo)</div>
        <div>🔄 <strong>Click + Arrastre:</strong> Rotar órbita 360°</div>
        <div>✋ <strong>Click Derecho / Shift:</strong> Desplazar (Pan)</div>
        <div>⚡ <strong>LiDAR SLAM:</strong> Nube de puntos activa</div>
      </div>

      {/* GOTO Active Banner */}
      {gotoMode && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 bg-amber-500/90 backdrop-blur-md px-6 py-2 rounded-2xl border border-amber-300 text-slate-950 font-black text-sm flex items-center space-x-2 animate-bounce shadow-2xl pointer-events-none">
          <Crosshair className="w-5 h-5 animate-spin" />
          <span>MODO DESIGNACIÓN 3D ACTIVO: HAZ CLICK EN EL TERRENO PARA ASIGNAR WAYPOINT A {selectedDroneId}</span>
        </div>
      )}

      {/* Bottom Right: Picture-in-Picture (PiP) Live FPV Cam */}
      <div className="absolute bottom-3 right-3 pointer-events-auto z-20">
        {pipOpen ? (
          <div className={`bg-slate-950/95 backdrop-blur-md rounded-2xl border border-cyan-500/40 shadow-2xl overflow-hidden transition-all duration-300 ${pipMinimized ? 'w-48' : 'w-72 sm:w-80'}`}>
            <div className="bg-slate-900/90 px-3 py-1.5 border-b border-slate-800 flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span className="font-mono font-bold text-cyan-300">FPV {selectedDroneId}</span>
                <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-slate-800 text-amber-300">{cameraMode}</span>
              </div>
              <div className="flex items-center space-x-1">
                <button
                  onClick={async () => {
                    const next = cameraMode === 'RGB' ? 'THERMAL_FLIR' : 'RGB';
                    setCameraMode(next);
                    fetch(`/api/v1/camera/${selectedDroneId}/mode?mode=${next}`, { method: 'POST' }).catch(console.warn);
                    tacticalAudio.playButtonBeep();
                  }}
                  className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-bold"
                >
                  {cameraMode === 'RGB' ? 'FLIR' : 'RGB'}
                </button>
                <button
                  onClick={async () => {
                    tacticalAudio.playCameraShutter();
                    fetch(`/api/v1/camera/${selectedDroneId}/snapshot`, { method: 'POST' }).catch(console.warn);
                  }}
                  className="p-1 hover:bg-slate-800 text-rose-400 rounded text-xs"
                >
                  📸
                </button>
                <button
                  onClick={() => setPipMinimized(!pipMinimized)}
                  className="px-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded text-xs font-bold"
                >
                  {pipMinimized ? '▢' : '—'}
                </button>
                <button
                  onClick={() => setPipOpen(false)}
                  className="px-1 hover:bg-rose-950 text-slate-400 hover:text-rose-400 rounded text-xs"
                >
                  ✕
                </button>
              </div>
            </div>

            {!pipMinimized && (
              <div className="relative w-full h-44 bg-black flex items-center justify-center overflow-hidden">
                <img
                  src={`/api/v1/camera/${selectedDroneId}/stream`}
                  alt={`PiP FPV ${selectedDroneId}`}
                  className="w-full h-full object-cover"
                  style={{
                    filter: cameraMode === 'THERMAL_FLIR' ? 'contrast(1.4) saturate(2.4) hue-rotate(185deg)' : 'none'
                  }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><rect width="100%" height="100%" fill="%23050811"/><text x="50%" y="50%" fill="%2306b6d4" font-family="monospace" font-size="12" text-anchor="middle">TRANSMISIÓN FPV VIVO</text></svg>';
                  }}
                />
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-8 h-8 border border-cyan-400/50 rounded-full flex items-center justify-center">
                    <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full" />
                  </div>
                </div>
                <div className="absolute bottom-1.5 left-2 bg-slate-950/80 px-2 py-0.5 rounded text-[9px] font-mono text-emerald-400 font-bold">
                  ● 20 FPS MJPEG
                </div>

                {/* Virtual Flight Sticks in PiP if FBW active */}
                {fbwActive && (
                  <div className="absolute bottom-1.5 right-2 bg-rose-950/90 border border-rose-500 px-2 py-0.5 rounded text-[9px] font-mono text-white font-bold animate-pulse">
                    🎮 STICK FBW
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => setPipOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-900/90 hover:bg-slate-800 text-cyan-300 border border-cyan-500/40 rounded-xl text-xs font-bold shadow-xl transition"
          >
            <span>📷</span>
            <span>VER FPV {selectedDroneId}</span>
          </button>
        )}
      </div>
    </div>
  );
};
