import React, { useState, useEffect, useRef } from 'react';
import { useSwarmStore } from '../store/useSwarmStore';
import { 
  Bot, 
  Mic, 
  MicOff, 
  Send, 
  X, 
  Sparkles, 
  CheckCircle2, 
  Zap, 
  Flame, 
  Layers, 
  Radio, 
  Home, 
  Camera, 
  FileText,
  UserCheck
} from 'lucide-react';
import { tacticalVoice } from '../services/tacticalVoice';
import { tacticalAudio } from '../services/tacticalAudio';

interface ChatMessage {
  id: string;
  sender: 'user' | 'copilot';
  text: string;
  timestamp: string;
  actionTaken?: string;
}

export const TacticalAICopilot: React.FC = () => {
  const { 
    copilotOpen, 
    toggleCopilot, 
    drones, 
    selectedDroneId, 
    setSelectedDroneId, 
    cameraMode, 
    setCameraMode, 
    detections,
    dispatchGroundUnit,
    setActiveTab
  } = useSwarmStore();

  const [inputVal, setInputVal] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init-1',
      sender: 'copilot',
      text: 'Copiloto Táctico BIOSCAOUT activo. Listo para recibir órdenes operacionales por voz o texto.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, copilotOpen]);

  // Initialize Speech Recognition if supported
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = 'es-ES';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setIsListening(true);
        tacticalAudio.playButtonBeep();
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          executeCommand(transcript);
        }
      };

      recognition.onerror = (e: any) => {
        console.warn('Speech recognition error:', e);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, [drones, selectedDroneId, cameraMode, detections]);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert('Tu navegador no soporta Web Speech Recognition API. Por favor usa el teclado o Google Chrome.');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
      } catch (e) {
        recognitionRef.current.stop();
        setIsListening(false);
      }
    }
  };

  // Natural Language Intent Engine
  const executeCommand = async (rawText: string) => {
    const text = rawText.trim();
    if (!text) return;

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: timeStr,
    };

    setMessages(prev => [...prev, userMsg]);
    setInputVal('');
    tacticalAudio.playRadioChirp();

    const lower = text.toLowerCase();
    let replyText = '';
    let actionTaken: string | undefined = undefined;

    // Intent 1: Formations
    if (lower.includes('delta') || lower.includes('punta de flecha')) {
      actionTaken = 'FORMACIÓN DELTA';
      replyText = 'Coordinando enjambre hacia Formación Delta con líder ARES-01.';
      fetch('/api/v1/drones/formation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formation: 'DELTA', spacing_m: 25.0 }),
      }).catch(console.warn);
    } else if (lower.includes('línea') || lower.includes('linea') || lower.includes('paralelo') || lower.includes('frente')) {
      actionTaken = 'FORMACIÓN LÍNEA';
      replyText = 'Flota maniobrando a Formación Línea en Frente para barrido de área.';
      fetch('/api/v1/drones/formation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formation: 'LINE', spacing_m: 25.0 }),
      }).catch(console.warn);
    } else if (lower.includes('órbita') || lower.includes('orbita') || lower.includes('círculo') || lower.includes('circulo')) {
      actionTaken = 'FORMACIÓN ÓRBITA 360°';
      replyText = 'Asignando anillo perimétrico orbital 360° de vigilancia activa.';
      fetch('/api/v1/drones/formation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formation: 'ORBIT', spacing_m: 30.0 }),
      }).catch(console.warn);
    } else if (lower.includes('echelon') || lower.includes('columna') || lower.includes('fila')) {
      actionTaken = 'FORMACIÓN ECHELON';
      replyText = 'Desplegando formación en columna escalonada Echelon.';
      fetch('/api/v1/drones/formation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formation: 'ECHELON', spacing_m: 25.0 }),
      }).catch(console.warn);
    }
    // Intent 2: Return to Home / RTH
    else if (lower.includes('rth') || lower.includes('regres') || lower.includes('base') || lower.includes('casa')) {
      actionTaken = 'ORDEN RTH';
      replyText = 'Orden de Retorno a Base transmitida a toda la flota.';
      fetch('/api/v1/drones/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'RTH' }),
      }).catch(console.warn);
    }
    // Intent 3: Takeoff / Land
    else if (lower.includes('despeg') || lower.includes('vuelen')) {
      actionTaken = 'DESPEGUE FLOTA';
      replyText = 'Secuencia de despegue y ascenso iniciada para el enjambre.';
      fetch('/api/v1/drones/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'TAKEOFF' }),
      }).catch(console.warn);
    } else if (lower.includes('aterri') || lower.includes('bajar')) {
      actionTaken = 'ATERRIZAJE FLOTA';
      replyText = 'Iniciando descenso controlado y aterrizaje.';
      fetch('/api/v1/drones/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'LAND' }),
      }).catch(console.warn);
    }
    // Intent 4: Camera / FLIR
    else if (lower.includes('flir') || lower.includes('térmic') || lower.includes('termic')) {
      actionTaken = 'MODO FLIR TÉRMICO';
      replyText = `Cámara de ${selectedDroneId} conmutada a espectro infrarrojo térmico FLIR.`;
      setCameraMode('THERMAL_FLIR');
      fetch(`/api/v1/camera/${selectedDroneId}/mode?mode=THERMAL_FLIR`, { method: 'POST' }).catch(console.warn);
    } else if (lower.includes('rgb') || lower.includes('óptic') || lower.includes('optic') || lower.includes('normal')) {
      actionTaken = 'MODO RGB ÓPTICO';
      replyText = `Cámara de ${selectedDroneId} conmutada a sensor óptico RGB color.`;
      setCameraMode('RGB');
      fetch(`/api/v1/camera/${selectedDroneId}/mode?mode=RGB`, { method: 'POST' }).catch(console.warn);
    } else if (lower.includes('foto') || lower.includes('snapshot') || lower.includes('captur') || lower.includes('evidencia')) {
      actionTaken = 'SNAPSHOT EVIDENCIA';
      replyText = `Fotograma forense capturado por ${selectedDroneId} y archivado en disco.`;
      tacticalAudio.playCameraShutter();
      fetch(`/api/v1/camera/${selectedDroneId}/snapshot`, { method: 'POST' }).catch(console.warn);
    }
    // Intent 5: Select Drone
    else if (lower.includes('dron 1') || lower.includes('ares 1') || lower.includes('alfa')) {
      actionTaken = 'UNIDAD ARES-01';
      setSelectedDroneId('ARES-01');
      replyText = 'ARES-01 seleccionado como unidad táctica activa.';
    } else if (lower.includes('dron 2') || lower.includes('ares 2') || lower.includes('bravo')) {
      actionTaken = 'UNIDAD ARES-02';
      setSelectedDroneId('ARES-02');
      replyText = 'ARES-02 seleccionado como unidad táctica activa.';
    } else if (lower.includes('dron 3') || lower.includes('ares 3') || lower.includes('charlie')) {
      actionTaken = 'UNIDAD ARES-03';
      setSelectedDroneId('ARES-03');
      replyText = 'ARES-03 seleccionado como unidad táctica activa.';
    }
    // Intent 6: Battery & Telemetry Report
    else if (lower.includes('batería') || lower.includes('bateria') || lower.includes('estado') || lower.includes('reporte')) {
      const batSummary = drones.map(d => `${d.drone_id}: ${d.battery.toFixed(0)}%`).join(', ');
      replyText = `Estado de flota: ${drones.length} drones en vuelo. Niveles de batería: ${batSummary}. Burbujas de 15m nominales.`;
    }
    // Intent 7: Dispatch Ground Rescue
    else if (lower.includes('rescate') || lower.includes('tierra') || lower.includes('médico') || lower.includes('medico')) {
      actionTaken = 'DESPACHO TERRESTRE';
      dispatchGroundUnit('RESCATE-ALFA', 'TGT-SURVIVOR-01');
      replyText = 'Equipo de rescate terrestre RESCATE-ALFA despachado hacia el objetivo identificado por D-FINE.';
    }
    // Intent 8: Generate Report AAR
    else if (lower.includes('aar') || lower.includes('informe')) {
      actionTaken = 'INFORME AAR';
      setActiveTab('missions');
      replyText = 'Abriendo panel de misiones para generación del dossier oficial AAR.';
    }
    // Fallback
    else {
      replyText = `Comando interpretado: "${text}". Ejecutando protocolo de patrullaje táctico autónomo.`;
    }

    // Voice response & audio cue
    tacticalAudio.playLockOn();
    tacticalVoice.speak(replyText, 'copilot', true);

    const copilotMsg: ChatMessage = {
      id: `copilot-${Date.now()}`,
      sender: 'copilot',
      text: replyText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      actionTaken,
    };

    setMessages(prev => [...prev, copilotMsg]);
  };

  if (!copilotOpen) return null;

  return (
    <div className="fixed bottom-16 right-4 sm:right-6 z-50 w-96 max-w-[calc(100vw-2rem)] bg-[#0b1220]/95 backdrop-blur-xl border border-cyan-500/50 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slideUp select-none">
      {/* Copilot Header */}
      <div className="bg-gradient-to-r from-slate-900 via-cyan-950 to-slate-900 px-4 py-3 border-b border-cyan-500/30 flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/30">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-extrabold text-xs tracking-wider text-cyan-300">COPILOTO IA</span>
              <span className="px-1.5 py-0.2 text-[9px] font-black rounded-full bg-emerald-950 text-emerald-300 border border-emerald-600">
                VOZ ACTIVA
              </span>
            </div>
            <p className="text-[10px] text-slate-400">BIOSCAOUT Tactical Swarm Intelligence</p>
          </div>
        </div>

        <button
          onClick={() => { tacticalAudio.playButtonBeep(); toggleCopilot(); }}
          className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Chat Messages Log */}
      <div className="p-3.5 flex-1 overflow-y-auto max-h-72 space-y-2.5 text-xs font-sans">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[85%] px-3 py-2 rounded-xl text-[11px] leading-relaxed shadow-md ${
                m.sender === 'user'
                  ? 'bg-gradient-to-r from-cyan-600 to-sky-600 text-white rounded-br-none'
                  : 'bg-slate-900/90 text-slate-200 border border-slate-700/80 rounded-bl-none'
              }`}
            >
              {m.text}

              {m.actionTaken && (
                <div className="mt-1.5 pt-1.5 border-t border-slate-700/50 flex items-center text-[10px] text-emerald-400 font-bold font-mono">
                  <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-400" />
                  <span>EJECUTADO: {m.actionTaken}</span>
                </div>
              )}
            </div>
            <span className="text-[9px] text-slate-500 mt-0.5 px-1 font-mono">{m.timestamp}</span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Action Chips */}
      <div className="px-3 py-1.5 bg-slate-950/70 border-t border-slate-800/80 flex items-center space-x-1.5 overflow-x-auto no-scrollbar text-[10px] font-mono">
        <button
          onClick={() => executeCommand('Formación Delta')}
          className="px-2 py-1 bg-slate-900 hover:bg-cyan-950 border border-slate-700 hover:border-cyan-500 text-cyan-300 rounded-lg shrink-0 transition"
        >
          ▲ Formación Delta
        </button>
        <button
          onClick={() => executeCommand('Formación Línea')}
          className="px-2 py-1 bg-slate-900 hover:bg-cyan-950 border border-slate-700 hover:border-cyan-500 text-cyan-300 rounded-lg shrink-0 transition"
        >
          ━ Línea en Frente
        </button>
        <button
          onClick={() => executeCommand('Cámara Térmica FLIR')}
          className="px-2 py-1 bg-slate-900 hover:bg-amber-950 border border-slate-700 hover:border-amber-500 text-amber-300 rounded-lg shrink-0 transition"
        >
          🔥 FLIR Térmico
        </button>
        <button
          onClick={() => executeCommand('Capturar Snapshot')}
          className="px-2 py-1 bg-slate-900 hover:bg-rose-950 border border-slate-700 hover:border-rose-500 text-rose-300 rounded-lg shrink-0 transition"
        >
          📸 Snapshot
        </button>
        <button
          onClick={() => executeCommand('Retorno a Base RTH')}
          className="px-2 py-1 bg-slate-900 hover:bg-rose-950 border border-slate-700 hover:border-rose-500 text-rose-300 rounded-lg shrink-0 transition"
        >
          🏠 RTH Flota
        </button>
      </div>

      {/* Input Box & Voice Button */}
      <div className="p-3 bg-slate-900 border-t border-slate-800 flex items-center space-x-2">
        <button
          onClick={toggleListening}
          className={`p-2 rounded-xl transition shadow-lg ${
            isListening
              ? 'bg-rose-600 text-white animate-pulse ring-2 ring-rose-400'
              : 'bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700'
          }`}
          title={isListening ? 'Escuchando... Haz click para detener' : 'Hablar por micrófono con el Copiloto IA'}
        >
          {isListening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
        </button>

        <input
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              executeCommand(inputVal);
            }
          }}
          placeholder={isListening ? 'Escuchando tu voz...' : 'Escribe una orden operacional...'}
          className="flex-1 bg-slate-950 border border-slate-700 focus:border-cyan-400 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none"
        />

        <button
          onClick={() => executeCommand(inputVal)}
          disabled={!inputVal.trim()}
          className="p-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white rounded-xl transition shadow-md"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
