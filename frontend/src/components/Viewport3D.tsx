import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useSwarmStore } from '../store/useSwarmStore';
import { DroneTelemetry } from '../types/telemetry';

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

export const Viewport3D: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dronesRef = useRef<DroneTelemetry[]>([]);
  const selectedDroneId = useSwarmStore(s => s.selectedDroneId);

  // Sync ref with store without triggering re-render of Three.js canvas
  useEffect(() => {
    return useSwarmStore.subscribe(state => {
      dronesRef.current = state.drones;
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060911);
    scene.fog = new THREE.FogExp2(0x060911, 0.0035);

    const camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / container.clientHeight,
      0.5,
      2000
    );
    camera.position.set(0, 75, 120);
    camera.lookAt(0, 15, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // 2. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x38bdf8, 1.8);
    dirLight.position.set(50, 150, 50);
    scene.add(dirLight);

    const accentLight = new THREE.PointLight(0x06b6d4, 2, 200);
    accentLight.position.set(0, 40, 0);
    scene.add(accentLight);

    // 3. Ground Plane with Tactical MGRS Grid
    const gridHelper = new THREE.GridHelper(400, 40, 0x0ea5e9, 0x1e293b);
    gridHelper.position.y = 0;
    scene.add(gridHelper);

    // Concentric Range Rings (25m, 50m, 100m, 150m)
    [25, 50, 100, 150].forEach(r => {
      const ringGeo = new THREE.RingGeometry(r - 0.2, r + 0.2, 64);
      const ringMat = new THREE.MeshBasicMaterial({ 
        color: 0x06b6d4, 
        side: THREE.DoubleSide, 
        transparent: true, 
        opacity: 0.22 
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      scene.add(ring);
    });

    // Base Station Pad marker
    const padGeo = new THREE.CylinderGeometry(6, 6, 0.4, 32);
    const padMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.8, roughness: 0.2 });
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.set(0, 0.2, 0);
    scene.add(pad);

    // 4. Drone Mesh Factory & Cache
    interface Drone3DObject {
      group: THREE.Group;
      body: THREE.Mesh;
      rotors: THREE.Mesh[];
      bubble: THREE.Mesh;
      bubbleWire: THREE.LineSegments;
      dropLine: THREE.Line;
      dropShadow: THREE.Mesh;
      frustum: THREE.LineSegments;
      evasionArrow: THREE.ArrowHelper | null;
    }

    const droneObjects: Map<string, Drone3DObject> = new Map();

    const getOrCreateDrone3D = (droneId: string): Drone3DObject => {
      if (droneObjects.has(droneId)) return droneObjects.get(droneId)!;

      const group = new THREE.Group();

      // Drone Central Fuselage
      const bodyGeo = new THREE.BoxGeometry(2.4, 0.6, 2.4);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: droneId === 'ARES-01' ? 0x06b6d4 : droneId === 'ARES-02' ? 0x10b981 : 0xa855f7,
        metalness: 0.9,
        roughness: 0.2,
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      group.add(body);

      // Nose direction indicator (triangle)
      const noseGeo = new THREE.ConeGeometry(0.6, 1.2, 3);
      const noseMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      const nose = new THREE.Mesh(noseGeo, noseMat);
      nose.rotation.x = -Math.PI / 2;
      nose.position.z = 1.6;
      group.add(nose);

      // 4 Carbon Arms & Rotor Discs
      const rotors: THREE.Mesh[] = [];
      const armOffsets = [
        [1.8, 1.8],
        [-1.8, 1.8],
        [1.8, -1.8],
        [-1.8, -1.8],
      ];

      armOffsets.forEach(([dx, dz]) => {
        const armGeo = new THREE.CylinderGeometry(0.12, 0.12, 2.5);
        const armMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.9 });
        const arm = new THREE.Mesh(armGeo, armMat);
        arm.position.set(dx * 0.5, 0, dz * 0.5);
        arm.rotation.z = Math.PI / 2;
        arm.rotation.y = Math.atan2(dz, dx);
        group.add(arm);

        // Rotor Disc (semi-transparent blurred circle)
        const rotorGeo = new THREE.CylinderGeometry(1.1, 1.1, 0.05, 16);
        const rotorMat = new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.45,
        });
        const rotor = new THREE.Mesh(rotorGeo, rotorMat);
        rotor.position.set(dx, 0.3, dz);
        group.add(rotor);
        rotors.push(rotor);
      });

      // 15m Tactical Safety Bubble Sphere
      const bubbleGeo = new THREE.SphereGeometry(15, 24, 16);
      const bubbleMat = new THREE.MeshBasicMaterial({
        color: 0x06b6d4,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
      });
      const bubble = new THREE.Mesh(bubbleGeo, bubbleMat);
      group.add(bubble);

      const wireGeo = new THREE.WireframeGeometry(bubbleGeo);
      const wireMat = new THREE.LineBasicMaterial({
        color: 0x06b6d4,
        transparent: true,
        opacity: 0.25,
      });
      const bubbleWire = new THREE.LineSegments(wireGeo, wireMat);
      group.add(bubbleWire);

      // Camera Frustum Pyramid (downward FOV)
      const frustumGeo = new THREE.BufferGeometry();
      const frustumPoints = [
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(-10, -25, -10),
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, -25, -10),
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, -25, 10),
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(-10, -25, 10),
        // Base rectangle
        new THREE.Vector3(-10, -25, -10), new THREE.Vector3(10, -25, -10),
        new THREE.Vector3(10, -25, -10), new THREE.Vector3(10, -25, 10),
        new THREE.Vector3(10, -25, 10), new THREE.Vector3(-10, -25, 10),
        new THREE.Vector3(-10, -25, 10), new THREE.Vector3(-10, -25, -10),
      ];
      frustumGeo.setFromPoints(frustumPoints);
      const frustumMat = new THREE.LineBasicMaterial({
        color: 0x10b981,
        transparent: true,
        opacity: 0.35,
      });
      const frustum = new THREE.LineSegments(frustumGeo, frustumMat);
      group.add(frustum);

      // Altitude Drop Line down to ground
      const lineMat = new THREE.LineDashedMaterial({
        color: 0x38bdf8,
        dashSize: 1.5,
        gapSize: 1,
        transparent: true,
        opacity: 0.5,
      });
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, -30, 0),
      ]);
      const dropLine = new THREE.Line(lineGeo, lineMat);
      dropLine.computeLineDistances();
      scene.add(dropLine);

      // Ground shadow disc
      const shadowGeo = new THREE.CircleGeometry(2.5, 24);
      const shadowMat = new THREE.MeshBasicMaterial({
        color: 0x0284c7,
        transparent: true,
        opacity: 0.4,
      });
      const dropShadow = new THREE.Mesh(shadowGeo, shadowMat);
      dropShadow.rotation.x = -Math.PI / 2;
      dropShadow.position.y = 0.08;
      scene.add(dropShadow);

      scene.add(group);

      const d3d: Drone3DObject = {
        group,
        body,
        rotors,
        bubble,
        bubbleWire,
        dropLine,
        dropShadow,
        frustum,
        evasionArrow: null,
      };

      droneObjects.set(droneId, d3d);
      return d3d;
    };

    // 5. Interactive Mouse Orbit & Pan
    let isDragging = false;
    let isRightDrag = false;
    let prevMouseX = 0;
    let prevMouseY = 0;
    let azimuth = 0.4;
    let elevation = 0.55;
    let distance = 140;
    let targetLookAt = new THREE.Vector3(0, 15, 0);

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      isRightDrag = e.button === 2 || e.shiftKey;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    };

    const onMouseMove = (e: MouseEvent) => {
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
        targetLookAt.addScaledVector(right, -dx * 0.15);
        targetLookAt.y += dy * 0.15;
      } else {
        // Rotate Orbit
        azimuth -= dx * 0.006;
        elevation = Math.max(0.08, Math.min(Math.PI / 2 - 0.05, elevation + dy * 0.006));
      }
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      distance = Math.max(20, Math.min(600, distance + e.deltaY * 0.12));
    };

    const dom = renderer.domElement;
    dom.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    dom.addEventListener('wheel', onWheel, { passive: false });
    dom.addEventListener('contextmenu', e => e.preventDefault());

    // 6. Animation Loop (60 FPS)
    let animId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const time = clock.getElapsedTime();

      // Update camera position based on orbit params
      camera.position.x = targetLookAt.x + distance * Math.cos(elevation) * Math.sin(azimuth);
      camera.position.y = targetLookAt.y + distance * Math.sin(elevation);
      camera.position.z = targetLookAt.z + distance * Math.cos(elevation) * Math.cos(azimuth);
      camera.lookAt(targetLookAt);

      // Render & update active drones from the telemetry stream
      const currentDrones = dronesRef.current;
      currentDrones.forEach(drone => {
        const d3d = getOrCreateDrone3D(drone.drone_id);
        const [x, y, z] = geoToCartesian(drone.lat, drone.lon, drone.alt);

        // Position drone group
        d3d.group.position.set(x, y, z);

        // Orientation (Euler degrees to rad)
        const rollRad = THREE.MathUtils.degToRad(drone.orientation.roll);
        const pitchRad = THREE.MathUtils.degToRad(drone.orientation.pitch);
        const yawRad = THREE.MathUtils.degToRad(-drone.orientation.yaw); // inverted for 3D heading
        d3d.group.rotation.set(pitchRad, yawRad, rollRad);

        // Spin rotors
        d3d.rotors.forEach(r => {
          r.rotation.y += delta * 45;
        });

        // Altitude drop line & ground shadow
        const linePos = d3d.dropLine.geometry.attributes.position as THREE.BufferAttribute;
        linePos.setXYZ(0, x, y, z);
        linePos.setXYZ(1, x, 0.1, z);
        linePos.needsUpdate = true;
        (d3d.dropLine.material as THREE.LineDashedMaterial).opacity = 0.5;

        d3d.dropShadow.position.set(x, 0.08, z);
        // Size shadow proportionally to altitude
        const shadowScale = Math.max(0.6, 2.5 - drone.alt * 0.04);
        d3d.dropShadow.scale.set(shadowScale, shadowScale, 1);

        // 15m Safety Bubble dynamic warning
        const isBreached = drone.in_safety_breach || (drone.nearest_distance_m !== null && (drone.nearest_distance_m ?? 999) < 15.0);
        if (isBreached) {
          const pulse = (Math.sin(time * 12) + 1) / 2;
          (d3d.bubble.material as THREE.MeshBasicMaterial).color.setHex(0xf43f5e);
          (d3d.bubble.material as THREE.MeshBasicMaterial).opacity = 0.25 + pulse * 0.25;
          (d3d.bubbleWire.material as THREE.LineBasicMaterial).color.setHex(0xf43f5e);
          (d3d.bubbleWire.material as THREE.LineBasicMaterial).opacity = 0.6 + pulse * 0.4;
        } else {
          (d3d.bubble.material as THREE.MeshBasicMaterial).color.setHex(0x06b6d4);
          (d3d.bubble.material as THREE.MeshBasicMaterial).opacity = 0.08;
          (d3d.bubbleWire.material as THREE.LineBasicMaterial).color.setHex(0x06b6d4);
          (d3d.bubbleWire.material as THREE.LineBasicMaterial).opacity = 0.22;
        }

        // Reactive Evasion Vector Arrow
        if (drone.evasion_vector && (Math.abs(drone.evasion_vector.x) > 0.01 || Math.abs(drone.evasion_vector.y) > 0.01 || Math.abs(drone.evasion_vector.z) > 0.01)) {
          const evDir = new THREE.Vector3(drone.evasion_vector.x, drone.evasion_vector.z, drone.evasion_vector.y).normalize();
          const evLen = Math.max(6, Math.sqrt(drone.evasion_vector.x**2 + drone.evasion_vector.y**2 + drone.evasion_vector.z**2) * 2.5);

          if (!d3d.evasionArrow) {
            d3d.evasionArrow = new THREE.ArrowHelper(evDir, new THREE.Vector3(x, y, z), evLen, 0xf43f5e, 3, 1.5);
            scene.add(d3d.evasionArrow);
          } else {
            d3d.evasionArrow.position.set(x, y, z);
            d3d.evasionArrow.setDirection(evDir);
            d3d.evasionArrow.setLength(evLen, 3, 1.5);
            d3d.evasionArrow.visible = true;
          }
        } else if (d3d.evasionArrow) {
          d3d.evasionArrow.visible = false;
        }
      });

      renderer.render(scene, camera);
    };

    animate();

    // 7. Resize handler
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
    <div className="relative w-full h-full min-h-[460px] bg-[#060911] rounded-2xl overflow-hidden border border-slate-700/60 shadow-inner">
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* 3D Overlay HUD Controls */}
      <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-cyan-500/30 text-xs font-mono text-cyan-300 flex items-center space-x-2">
        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
        <span className="font-bold">ESPACIO AÉREO 3D REAL (WEBGL)</span>
        <span className="text-slate-400">|</span>
        <span className="text-slate-300">Burbuja: 15m</span>
      </div>

      <div className="absolute bottom-3 left-3 bg-slate-900/80 backdrop-blur-md p-2 rounded-xl border border-slate-700/60 text-[11px] text-slate-300 space-y-1">
        <div>🖱️ <strong>Click Izquierdo:</strong> Rotar órbita</div>
        <div>🖱️ <strong>Click Derecho / Shift:</strong> Desplazar (Pan)</div>
        <div>🔍 <strong>Rueda:</strong> Zoom in / out</div>
      </div>

      <div className="absolute top-3 right-3 flex items-center space-x-2">
        <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-cyan-950/90 text-cyan-300 border border-cyan-700/60 shadow-sm">
          WGS84 ETRS89
        </span>
      </div>
    </div>
  );
};
