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
  UserCheck
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

  // UI state overlays
  const [camMode, setCamMode] = useState<CameraPerspective>('orbit');
  const [showBubbles, setShowBubbles] = useState<boolean>(true);
  const [showTrails, setShowTrails] = useState<boolean>(true);
  const [showDetections, setShowDetections] = useState<boolean>(true);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [pipOpen, setPipOpen] = useState<boolean>(true);
  const [pipMinimized, setPipMinimized] = useState<boolean>(false);
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
    dirLight.shadow.camera.near = 10;
    dirLight.shadow.camera.far = 400;
    dirLight.shadow.camera.left = -150;
    dirLight.shadow.camera.right = 150;
    dirLight.shadow.camera.top = 150;
    dirLight.shadow.camera.bottom = -150;
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
    const northGeo = new THREE.BufferGeometry().setFromPoints(northPoints);
    const northLine = new THREE.Line(northGeo, axisMat);
    envGroup.add(northLine);

    // North Cone Arrow
    const northArrowGeo = new THREE.ConeGeometry(2.5, 6, 8);
    const northArrowMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const northArrow = new THREE.Mesh(northArrowGeo, northArrowMat);
    northArrow.position.set(0, 0.2, -225);
    northArrow.rotation.x = -Math.PI / 2;
    envGroup.add(northArrow);

    // -------------------------------------------------------------
    // Base Station Launch Pad (Octagonal Helipad with illuminated 'H')
    // -------------------------------------------------------------
    const padGroup = new THREE.Group();
    padGroup.position.set(0, 0, 0);

    const padBaseGeo = new THREE.CylinderGeometry(8, 8.5, 0.4, 8);
    const padBaseMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.8,
      roughness: 0.3,
    });
    const padBase = new THREE.Mesh(padBaseGeo, padBaseMat);
    padBase.position.y = 0.2;
    padGroup.add(padBase);

    // Hazard Border Ring
    const padRingGeo = new THREE.RingGeometry(7.2, 7.8, 32);
    const padRingMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
    });
    const padRing = new THREE.Mesh(padRingGeo, padRingMat);
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
    const mastGeo = new THREE.CylinderGeometry(0.12, 0.2, 9, 8);
    const mastMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.9 });
    const mast = new THREE.Mesh(mastGeo, mastMat);
    mast.position.set(-7.5, 4.5, -7.5);
    padGroup.add(mast);

    const beaconGeo = new THREE.SphereGeometry(0.35, 12, 8);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.set(-7.5, 9.2, -7.5);
    padGroup.add(beacon);

    envGroup.add(padGroup);

    // -------------------------------------------------------------
    // 4. INTERACTIVE GOTO 3D BEACON & TRAJECTORY SPLINE
    // -------------------------------------------------------------
    const gotoBeaconGroup = new THREE.Group();
    gotoBeaconGroup.visible = false;
    scene.add(gotoBeaconGroup);

    // Rotating ground crosshair ring
    const gotoRingGeo = new THREE.RingGeometry(2.5, 3.2, 32);
    const gotoRingMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    });
    const gotoRing = new THREE.Mesh(gotoRingGeo, gotoRingMat);
    gotoRing.rotation.x = -Math.PI / 2;
    gotoRing.position.y = 0.15;
    gotoBeaconGroup.add(gotoRing);

    // Glowing destination vertical beam
    const gotoBeamGeo = new THREE.CylinderGeometry(0.35, 1.2, 35, 16);
    const gotoBeamMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.35,
    });
    const gotoBeam = new THREE.Mesh(gotoBeamGeo, gotoBeamMat);
    gotoBeam.position.y = 17.5;
    gotoBeaconGroup.add(gotoBeam);

    // Top pulsing diamond marker
    const diamondGeo = new THREE.OctahedronGeometry(1.6);
    const diamondMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.8,
      metalness: 0.9,
    });
    const diamond = new THREE.Mesh(diamondGeo, diamondMat);
    diamond.position.y = 35;
    gotoBeaconGroup.add(diamond);

    // 3D Trajectory Spline Curve from selected drone to GOTO
    const trajLineMat = new THREE.LineDashedMaterial({
      color: 0xf59e0b,
      dashSize: 2.0,
      gapSize: 1.0,
      transparent: true,
      opacity: 0.85,
    });
    const trajLineGeo = new THREE.BufferGeometry();
    const trajLine = new THREE.Line(trajLineGeo, trajLineMat);
    trajLine.visible = false;
    scene.add(trajLine);

    // Active conflict laser beam between drones
    const conflictLaserMat = new THREE.LineBasicMaterial({
      color: 0xf43f5e,
      linewidth: 3,
      transparent: true,
      opacity: 0.9,
    });
    const conflictLaserGeo = new THREE.BufferGeometry();
    const conflictLaser = new THREE.Line(conflictLaserGeo, conflictLaserMat);
    conflictLaser.visible = false;
    scene.add(conflictLaser);

    // -------------------------------------------------------------
    // 5. DRONE 3D MODEL FACTORY & CACHE
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

    // Helper to generate dynamic Canvas texture for floating drone badge
    const createBadgeTexture = (callsign: string, alt: number, speed: number, bat: number, state: string) => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Background card
        ctx.fillStyle = 'rgba(11, 18, 32, 0.85)';
        ctx.roundRect ? ctx.roundRect(4, 4, 248, 92, 12) : ctx.rect(4, 4, 248, 92);
        ctx.fill();

        // Border
        ctx.strokeStyle = callsign === 'ARES-01' ? '#06b6d4' : callsign === 'ARES-02' ? '#10b981' : '#a855f7';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Callsign header
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px monospace';
        ctx.fillText(callsign, 16, 32);

        // State Badge
        ctx.fillStyle = state === 'IN_FLIGHT' ? '#10b981' : '#f59e0b';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(state, 150, 32);

        // Divider
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(16, 42);
        ctx.lineTo(240, 42);
        ctx.stroke();

        // Telemetry values
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

      // 1. Carbon Fiber Fuselage (Hexagonal aerodynamic body)
      const bodyGeo = new THREE.CylinderGeometry(1.6, 2.0, 0.7, 6);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.85,
        roughness: 0.25,
      });
      const fuselage = new THREE.Mesh(bodyGeo, bodyMat);
      fuselage.castShadow = true;
      group.add(fuselage);

      // Top Carbon Shell with Accent Stripe
      const shellGeo = new THREE.ConeGeometry(1.5, 0.5, 6);
      const shellMat = new THREE.MeshStandardMaterial({
        color: accentHex,
        emissive: accentHex,
        emissiveIntensity: 0.35,
        metalness: 0.7,
      });
      const shell = new THREE.Mesh(shellGeo, shellMat);
      shell.position.y = 0.55;
      group.add(shell);

      // Nose Direction Arrow / Cockpit canopy
      const noseGeo = new THREE.ConeGeometry(0.7, 1.6, 4);
      const noseMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.9, roughness: 0.1 });
      const nose = new THREE.Mesh(noseGeo, noseMat);
      nose.rotation.x = -Math.PI / 2;
      nose.position.set(0, 0.1, 1.8);
      group.add(nose);

      // 2. Gimbal Camera Sensor (Under-nose 3-axis ball)
      const gimbalGroup = new THREE.Group();
      gimbalGroup.position.set(0, -0.4, 1.2);

      const gimbalBall = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0x090d16, metalness: 0.95 })
      );
      gimbalGroup.add(gimbalBall);

      const lensGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.3, 16);
      const lensMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      const lens = new THREE.Mesh(lensGeo, lensMat);
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

        // Carbon Arm Tube
        const armGeo = new THREE.CylinderGeometry(0.12, 0.12, armRadius * 1.05);
        const armMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.9 });
        const arm = new THREE.Mesh(armGeo, armMat);
        arm.position.set(dx * 0.5, 0.05, dz * 0.5);
        arm.rotation.z = Math.PI / 2;
        arm.rotation.y = angle;
        group.add(arm);

        // Motor Bell
        const motorGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.5, 12);
        const motorMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9 });
        const motor = new THREE.Mesh(motorGeo, motorMat);
        motor.position.set(dx, 0.2, dz);
        group.add(motor);

        // Landing Skid leg
        const skidLegGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.2);
        const skidLeg = new THREE.Mesh(skidLegGeo, armMat);
        skidLeg.position.set(dx * 0.8, -0.6, dz * 0.8);
        group.add(skidLeg);

        // High-RPM Spinning Blurred Rotor Disc
        const rotorDiscGeo = new THREE.CylinderGeometry(1.25, 1.25, 0.04, 24);
        const rotorDiscMat = new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.5,
        });
        const rotorDisc = new THREE.Mesh(rotorDiscGeo, rotorDiscMat);
        rotorDisc.position.set(dx, 0.45, dz);
        group.add(rotorDisc);
        rotors.push(rotorDisc);

        // Navigation LEDs on arm tips
        if (idx === 0) {
          // Right wingtip: Green
          const greenLed = new THREE.Mesh(new THREE.SphereGeometry(0.15), new THREE.MeshBasicMaterial({ color: 0x10b981 }));
          greenLed.position.set(dx * 1.1, 0.3, dz * 1.1);
          group.add(greenLed);
        } else if (idx === 1) {
          // Left wingtip: Red
          const redLed = new THREE.Mesh(new THREE.SphereGeometry(0.15), new THREE.MeshBasicMaterial({ color: 0xf43f5e }));
          redLed.position.set(dx * 1.1, 0.3, dz * 1.1);
          group.add(redLed);
        }
      });

      // Tail Strobe Light
      const strobeMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.2),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      strobeMesh.position.set(0, 0.4, -2.0);
      group.add(strobeMesh);

      const strobeLight = new THREE.PointLight(0xffffff, 2, 25);
      strobeLight.position.set(0, 0.4, -2.0);
      group.add(strobeLight);

      // 4. Tactical 15m Forcefield Safety Bubble
      const bubbleGeo = new THREE.SphereGeometry(15, 32, 24);
      const bubbleMat = new THREE.MeshBasicMaterial({
        color: 0x06b6d4,
        transparent: true,
        opacity: 0.09,
        depthWrite: false,
      });
      const bubble = new THREE.Mesh(bubbleGeo, bubbleMat);
      group.add(bubble);

      const wireGeo = new THREE.WireframeGeometry(bubbleGeo);
      const wireMat = new THREE.LineBasicMaterial({
        color: 0x06b6d4,
        transparent: true,
        opacity: 0.22,
      });
      const bubbleWire = new THREE.LineSegments(wireGeo, wireMat);
      group.add(bubbleWire);

      // 5. Altitude Drop Line to Ground
      const lineMat = new THREE.LineDashedMaterial({
        color: 0x38bdf8,
        dashSize: 1.5,
        gapSize: 1.0,
        transparent: true,
        opacity: 0.55,
      });
      const dropLineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, -30, 0),
      ]);
      const dropLine = new THREE.Line(dropLineGeo, lineMat);
      scene.add(dropLine);

      // Ground Shadow
      const shadowGeo = new THREE.CircleGeometry(2.5, 32);
      const shadowMat = new THREE.MeshBasicMaterial({
        color: 0x0284c7,
        transparent: true,
        opacity: 0.35,
      });
      const dropShadow = new THREE.Mesh(shadowGeo, shadowMat);
      dropShadow.rotation.x = -Math.PI / 2;
      dropShadow.position.y = 0.08;
      scene.add(dropShadow);

      // Ground Sonar Wave Ring
      const sonarGeo = new THREE.RingGeometry(2.8, 3.2, 32);
      const sonarMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.4,
      });
      const groundPulse = new THREE.Mesh(sonarGeo, sonarMat);
      groundPulse.rotation.x = -Math.PI / 2;
      groundPulse.position.y = 0.09;
      scene.add(groundPulse);

      // 6. Holographic Target Reticle (Spinning corners when selected)
      const reticle = new THREE.Group();
      const reticleMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85 });
      const reticleBox = new THREE.BoxGeometry(4.8, 2.2, 4.8);
      const reticleEdges = new THREE.LineSegments(new THREE.EdgesGeometry(reticleBox), reticleMat);
      reticle.add(reticleEdges);
      reticle.visible = false;
      group.add(reticle);

      // 7. Floating 3D Telemetry Billboard Badge
      const initialBadgeTex = createBadgeTexture(droneId, 30.0, 7.0, 85, 'IN_FLIGHT');
      const badgeMat = new THREE.SpriteMaterial({ map: initialBadgeTex, transparent: true });
      const badgeSprite = new THREE.Sprite(badgeMat);
      badgeSprite.scale.set(10, 4, 1);
      badgeSprite.position.set(0, 5.2, 0);
      group.add(badgeSprite);

      // 8. 3D Flight Trail Line
      const maxTrailPoints = 40;
      const trailPositions: THREE.Vector3[] = [];
      const trailGeo = new THREE.BufferGeometry();
      const trailMat = new THREE.LineBasicMaterial({
        color: accentHex,
        transparent: true,
        opacity: 0.6,
      });
      const trailLine = new THREE.Line(trailGeo, trailMat);
      scene.add(trailLine);

      // 9. Invisible HitBox for 3D Click & Raycasting Selection
      const hitBoxGeo = new THREE.SphereGeometry(4.0, 8, 6);
      const hitBoxMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitBox = new THREE.Mesh(hitBoxGeo, hitBoxMat);
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
    // 6. D-FINE 3D TARGET HOLOGRAMS CACHE
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

          // Vertical laser pillar
          const beamGeo = new THREE.CylinderGeometry(0.3, isFire ? 14 : 0.8, isFire ? 25 : 45, 16);
          const beamMat = new THREE.MeshBasicMaterial({
            color: colorHex,
            transparent: true,
            opacity: isFire ? 0.35 : 0.45,
          });
          const beamMesh = new THREE.Mesh(beamGeo, beamMat);
          beamMesh.position.y = isFire ? 12.5 : 22.5;
          group.add(beamMesh);

          // Ground perimeter warning circle (28m diameter for FIRE_HAZARD)
          const radius = isFire ? 14 : 4;
          const ringGeo = new THREE.RingGeometry(radius - 0.3, radius + 0.3, 32);
          const ringMat = new THREE.MeshBasicMaterial({
            color: colorHex,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.7,
          });
          const ringMesh = new THREE.Mesh(ringGeo, ringMat);
          ringMesh.rotation.x = -Math.PI / 2;
          ringMesh.position.y = 0.12;
          group.add(ringMesh);

          // Floating Badge Sprite
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
          const spriteMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true });
          const sprite = new THREE.Sprite(spriteMat);
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
    // 7. ORBIT CONTROLS & CAMERA INTERACTION STATE
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
      // If clicking GOTO mode, handle raycast on ground
      if (gotoModeRef.current && e.button === 0) {
        handleGotoClick(e);
        return;
      }

      // Check drone selection raycast
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

      // Raycast against ground plane for GOTO preview or hover readout
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
        // Pan
        const right = new THREE.Vector3();
        camera.getWorldDirection(right);
        right.cross(camera.up).normalize();
        targetLookAt.addScaledVector(right, -dx * 0.18);
        targetLookAt.y += dy * 0.18;
      } else {
        // Orbit
        azimuth -= dx * 0.0055;
        elevation = Math.max(0.08, Math.min(Math.PI / 2 - 0.04, elevation + dy * 0.0055));
      }
    };

    const onMouseUp = () => {
      isDragging = false;
    };

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
    // 8. ANIMATION LOOP (ROCK-SOLID 60 FPS)
    // -------------------------------------------------------------
    let animId: number;
    const clock = new THREE.Clock();
    let badgeUpdateTimer = 0;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const time = clock.getElapsedTime();
      badgeUpdateTimer += delta;

      const currentDrones = dronesRef.current;
      const activeSelectedId = selectedDroneIdRef.current;
      const curSelectedDrone = currentDrones.find(d => d.drone_id === activeSelectedId);

      // Environment elements toggle
      envGroup.visible = showGridRef.current;

      // 1. Camera Positioning based on Perspective Mode
      const mode = camModeRef.current;
      if (mode === 'orbit') {
        const cx = targetLookAt.x + distance * Math.cos(elevation) * Math.sin(azimuth);
        const cy = targetLookAt.y + distance * Math.sin(elevation);
        const cz = targetLookAt.z + distance * Math.cos(elevation) * Math.cos(azimuth);
        camera.position.lerp(new THREE.Vector3(cx, cy, cz), 0.12);
        camera.lookAt(targetLookAt);
      } else if (mode === 'chase' && curSelectedDrone) {
        // Chase Cam (Smoothly follows behind the selected drone)
        const [dx, dy, dz] = geoToCartesian(curSelectedDrone.lat, curSelectedDrone.lon, curSelectedDrone.alt);
        const yawRad = THREE.MathUtils.degToRad(-curSelectedDrone.orientation.yaw);
        // Offset 18m behind, 7m above
        const offsetX = -Math.sin(yawRad) * 22;
        const offsetZ = -Math.cos(yawRad) * 22;
        const targetCamPos = new THREE.Vector3(dx + offsetX, dy + 7, dz + offsetZ);
        camera.position.lerp(targetCamPos, 0.1);
        camera.lookAt(dx, dy + 2, dz);
      } else if (mode === 'top_down') {
        // Top-Down God-Eye View
        const focusX = curSelectedDrone ? geoToCartesian(curSelectedDrone.lat, curSelectedDrone.lon, curSelectedDrone.alt)[0] : 0;
        const focusZ = curSelectedDrone ? geoToCartesian(curSelectedDrone.lat, curSelectedDrone.lon, curSelectedDrone.alt)[2] : 0;
        const targetCamPos = new THREE.Vector3(focusX, 175, focusZ + 0.1);
        camera.position.lerp(targetCamPos, 0.08);
        camera.lookAt(focusX, 0, focusZ);
      } else if (mode === 'base') {
        // Base Station Fixed Cam
        const targetCamPos = new THREE.Vector3(0, 4, 18);
        camera.position.lerp(targetCamPos, 0.08);
        camera.lookAt(0, 35, -50);
      }

      // Rotate Helipad beacon
      beacon.material.opacity = Math.sin(time * 6) > 0 ? 1 : 0.3;

      // Rotate GOTO beacon elements if active
      if (gotoBeaconGroup.visible) {
        gotoRing.rotation.z += delta * 1.5;
        diamond.rotation.y += delta * 2.0;
        diamond.rotation.x = Math.sin(time * 3) * 0.2;
      }

      // 2. Render & Update Drones
      let conflictDroneA: [number, number, number] | null = null;
      let conflictDroneB: [number, number, number] | null = null;

      currentDrones.forEach(drone => {
        const d3d = getOrCreateDrone3D(drone.drone_id);
        const [x, y, z] = geoToCartesian(drone.lat, drone.lon, drone.alt);

        // Position drone group
        d3d.group.position.set(x, y, z);

        // Orientation
        const rollRad = THREE.MathUtils.degToRad(drone.orientation.roll);
        const pitchRad = THREE.MathUtils.degToRad(drone.orientation.pitch);
        const yawRad = THREE.MathUtils.degToRad(-drone.orientation.yaw);
        d3d.group.rotation.set(pitchRad, yawRad, rollRad);

        // Spin Rotors at high RPM
        d3d.rotors.forEach(r => {
          r.rotation.y += delta * 55;
        });

        // Anti-collision Tail Strobe (2 Hz flashing)
        const isStrobeOn = Math.sin(time * 16) > 0.65;
        d3d.strobeLight.intensity = isStrobeOn ? 3.0 : 0.1;
        (d3d.strobeMesh.material as THREE.MeshBasicMaterial).color.setHex(isStrobeOn ? 0xffffff : 0x334155);

        // PTZ Gimbal tilt
        const ptz = ptzRef.current[drone.drone_id];
        if (ptz) {
          d3d.gimbalGroup.rotation.x = THREE.MathUtils.degToRad(ptz.pitch_deg || -45);
          d3d.gimbalGroup.rotation.y = THREE.MathUtils.degToRad(ptz.yaw_deg || 0);
        }

        // Reticle for selected drone
        const isSelected = drone.drone_id === activeSelectedId;
        d3d.reticle.visible = isSelected;
        if (isSelected) {
          d3d.reticle.rotation.y += delta * 1.2;
        }

        // Altitude Drop Line
        const linePos = d3d.dropLine.geometry.attributes.position as THREE.BufferAttribute;
        linePos.setXYZ(0, x, y, z);
        linePos.setXYZ(1, x, 0.1, z);
        linePos.needsUpdate = true;
        (d3d.dropLine.material as THREE.LineDashedMaterial).opacity = 0.55;

        // Ground Shadow disc
        d3d.dropShadow.position.set(x, 0.08, z);
        const shadowScale = Math.max(0.6, 2.5 - drone.alt * 0.035);
        d3d.dropShadow.scale.set(shadowScale, shadowScale, 1);

        // Ground Sonar Wave Ring
        d3d.groundPulse.position.set(x, 0.09, z);
        const sonarCycle = (time * 1.2) % 1;
        d3d.groundPulse.scale.set(1 + sonarCycle * 2.5, 1 + sonarCycle * 2.5, 1);
        (d3d.groundPulse.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.5 * (1 - sonarCycle));

        // 15m Forcefield Safety Bubble Dynamic Warning
        const isBreached = drone.in_safety_breach || (drone.nearest_distance_m !== null && (drone.nearest_distance_m ?? 999) < 15.0);
        d3d.bubble.visible = showBubblesRef.current;
        d3d.bubbleWire.visible = showBubblesRef.current;

        if (isBreached) {
          const pulse = (Math.sin(time * 14) + 1) / 2;
          (d3d.bubble.material as THREE.MeshBasicMaterial).color.setHex(0xf43f5e);
          (d3d.bubble.material as THREE.MeshBasicMaterial).opacity = 0.22 + pulse * 0.28;
          (d3d.bubbleWire.material as THREE.LineBasicMaterial).color.setHex(0xf43f5e);
          (d3d.bubbleWire.material as THREE.LineBasicMaterial).opacity = 0.6 + pulse * 0.4;

          // Track conflict endpoints to render conflict laser beam
          if (!conflictDroneA) {
            conflictDroneA = [x, y, z];
          } else if (!conflictDroneB) {
            conflictDroneB = [x, y, z];
          }
        } else {
          (d3d.bubble.material as THREE.MeshBasicMaterial).color.setHex(0x06b6d4);
          (d3d.bubble.material as THREE.MeshBasicMaterial).opacity = 0.08;
          (d3d.bubbleWire.material as THREE.LineBasicMaterial).color.setHex(0x06b6d4);
          (d3d.bubbleWire.material as THREE.LineBasicMaterial).opacity = 0.22;
        }

        // 3D Flight Trail updates
        if (showTrailsRef.current) {
          d3d.trailLine.visible = true;
          d3d.trailPositions.push(new THREE.Vector3(x, y, z));
          if (d3d.trailPositions.length > 35) d3d.trailPositions.shift();
          d3d.trailLine.geometry.setFromPoints(d3d.trailPositions);
        } else {
          d3d.trailLine.visible = false;
        }

        // Update floating 3D badge at 4 Hz
        if (badgeUpdateTimer > 0.25) {
          d3d.badgeSprite.material.map?.dispose();
          d3d.badgeSprite.material.map = createBadgeTexture(
            drone.drone_id,
            drone.alt,
            drone.speed_ms,
            drone.battery,
            drone.fsm_state
          );
        }
      });

      if (badgeUpdateTimer > 0.25) badgeUpdateTimer = 0;

      // 3. Render Conflict Laser Beam if two drones are breaching 15m
      if (conflictDroneA && conflictDroneB && showBubblesRef.current) {
        conflictLaser.visible = true;
        const pts = [
          new THREE.Vector3(conflictDroneA[0], conflictDroneA[1], conflictDroneA[2]),
          new THREE.Vector3(conflictDroneB[0], conflictDroneB[1], conflictDroneB[2]),
        ];
        conflictLaser.geometry.setFromPoints(pts);
      } else {
        conflictLaser.visible = false;
      }

      // 4. Update GOTO Trajectory spline if an active waypoint exists
      if (curSelectedDrone && activeDestination) {
        trajLine.visible = true;
        const [dx, dy, dz] = geoToCartesian(curSelectedDrone.lat, curSelectedDrone.lon, curSelectedDrone.alt);
        const start = new THREE.Vector3(dx, dy, dz);
        const end = new THREE.Vector3(activeDestination.x, 0, activeDestination.z);
        const mid = new THREE.Vector3((dx + activeDestination.x) / 2, Math.max(dy, 25), (dz + activeDestination.z) / 2);
        const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
        const curvePts = curve.getPoints(30);
        trajLine.geometry.setFromPoints(curvePts);
        trajLine.computeLineDistances();
      } else {
        trajLine.visible = false;
      }

      // 5. Update D-FINE 3D Target Holograms
      updateDetections3D();

      renderer.render(scene, camera);
    };

    animate();

    // -------------------------------------------------------------
    // 9. RESIZE OBSERVER
    // -------------------------------------------------------------
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
        isFullscreen ? 'fixed inset-0 z-50 rounded-none' : 'min-h-[520px]'
      }`}
    >
      {/* 3D Top Status Bar HUD */}
      <div className="absolute top-3 left-3 flex flex-wrap items-center gap-2 pointer-events-auto">
        <div className="bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-cyan-500/40 text-xs font-mono text-cyan-300 flex items-center space-x-2 shadow-lg">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
          <span className="font-extrabold tracking-wide">ESPACIO AÉREO 3D REAL (WEBGL)</span>
          <span className="text-slate-500">|</span>
          <span className="text-emerald-400 font-bold">60 FPS</span>
          <span className="text-slate-500">|</span>
          <span className="text-amber-300 font-bold">15m BURBUJA</span>
        </div>

        {/* Camera Perspective Mode Switcher */}
        <div className="bg-slate-900/90 backdrop-blur-md p-1 rounded-xl border border-slate-700/80 flex items-center space-x-1 shadow-lg text-xs">
          <button
            onClick={() => setCamMode('orbit')}
            className={`px-2.5 py-1 font-bold rounded-lg transition ${
              camMode === 'orbit' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
            title="Órbita táctica libre"
          >
            Órbita
          </button>
          <button
            onClick={() => setCamMode('chase')}
            className={`px-2.5 py-1 font-bold rounded-lg transition flex items-center space-x-1 ${
              camMode === 'chase' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
            title="Seguimiento en tercera persona detrás del dron seleccionado"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Seguir Dron</span>
          </button>
          <button
            onClick={() => setCamMode('top_down')}
            className={`px-2.5 py-1 font-bold rounded-lg transition ${
              camMode === 'top_down' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
            title="Vista Cenital 3D (God-Eye)"
          >
            Cenital 3D
          </button>
          <button
            onClick={() => setCamMode('base')}
            className={`px-2.5 py-1 font-bold rounded-lg transition ${
              camMode === 'base' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
            title="Cámara fija en estación base de despegue"
          >
            Base
          </button>
        </div>
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
          title="Activa el cursor de designación GOTO en el terreno 3D"
        >
          <MapPin className="w-4 h-4" />
          <span>{gotoMode ? 'CANCELAR GOTO 3D' : 'DESIGNAR GOTO 3D'}</span>
        </button>

        {/* Toggle Layers Dropdown / Buttons */}
        <div className="bg-slate-900/90 backdrop-blur-md p-1 rounded-xl border border-slate-700/80 flex items-center space-x-1 text-xs">
          <button
            onClick={() => setShowBubbles(!showBubbles)}
            className={`px-2 py-1 rounded-lg font-bold transition ${
              showBubbles ? 'bg-cyan-950 text-cyan-300 border border-cyan-700/60' : 'text-slate-500 hover:text-slate-300'
            }`}
            title="Mostrar / Ocultar burbujas de seguridad de 15 metros"
          >
            15m
          </button>
          <button
            onClick={() => setShowTrails(!showTrails)}
            className={`px-2 py-1 rounded-lg font-bold transition ${
              showTrails ? 'bg-cyan-950 text-cyan-300 border border-cyan-700/60' : 'text-slate-500 hover:text-slate-300'
            }`}
            title="Mostrar / Ocultar estelas de vuelo 3D"
          >
            Estelas
          </button>
          <button
            onClick={() => setShowDetections(!showDetections)}
            className={`px-2 py-1 rounded-lg font-bold transition ${
              showDetections ? 'bg-cyan-950 text-cyan-300 border border-cyan-700/60' : 'text-slate-500 hover:text-slate-300'
            }`}
            title="Mostrar / Ocultar hologramas de IA D-FINE"
          >
            D-FINE
          </button>
          <button
            onClick={() => setShowGrid(!showGrid)}
            className={`px-2 py-1 rounded-lg font-bold transition ${
              showGrid ? 'bg-cyan-950 text-cyan-300 border border-cyan-700/60' : 'text-slate-500 hover:text-slate-300'
            }`}
            title="Malla MGRS y terreno"
          >
            Malla
          </button>
        </div>

        {/* Fullscreen Button */}
        <button
          onClick={toggleFullscreen}
          className="p-2 bg-slate-900/90 hover:bg-slate-800 rounded-xl border border-slate-700 text-slate-300 hover:text-white shadow-lg transition"
          title="Pantalla completa"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Floating Tactical Coordinate / Telemetry Readout (Bottom Center) */}
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
          <span>CONTROLES TÁCTICOS 3D</span>
        </div>
        <div>🖱️ <strong>Click en Dron:</strong> Seleccionar unidad táctica</div>
        <div>📍 <strong>Designar GOTO:</strong> Click en suelo 3D (con modo activo)</div>
        <div>🔄 <strong>Click Izquierdo + Arrastre:</strong> Rotar órbita 360°</div>
        <div>✋ <strong>Click Derecho / Shift:</strong> Desplazar vista (Pan)</div>
        <div>🔍 <strong>Rueda Ratón:</strong> Zoom in / out continuo</div>
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
            {/* PiP Header */}
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
                  title="Conmutar RGB / FLIR Térmico"
                >
                  {cameraMode === 'RGB' ? 'FLIR' : 'RGB'}
                </button>
                <button
                  onClick={async () => {
                    tacticalAudio.playCameraShutter();
                    fetch(`/api/v1/camera/${selectedDroneId}/snapshot`, { method: 'POST' }).catch(console.warn);
                  }}
                  className="p-1 hover:bg-slate-800 text-rose-400 rounded text-xs"
                  title="Capturar Snapshot"
                >
                  📸
                </button>
                <button
                  onClick={() => setPipMinimized(!pipMinimized)}
                  className="px-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded text-xs font-bold"
                  title={pipMinimized ? 'Maximizar' : 'Minimizar'}
                >
                  {pipMinimized ? '▢' : '—'}
                </button>
                <button
                  onClick={() => setPipOpen(false)}
                  className="px-1 hover:bg-rose-950 text-slate-400 hover:text-rose-400 rounded text-xs"
                  title="Cerrar PiP"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* PiP Video Body */}
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
                {/* Mini Crosshair */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-8 h-8 border border-cyan-400/50 rounded-full flex items-center justify-center">
                    <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full" />
                  </div>
                </div>
                {/* Live Tag */}
                <div className="absolute bottom-1.5 left-2 bg-slate-950/80 px-2 py-0.5 rounded text-[9px] font-mono text-emerald-400 font-bold">
                  ● 20 FPS MJPEG
                </div>
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
