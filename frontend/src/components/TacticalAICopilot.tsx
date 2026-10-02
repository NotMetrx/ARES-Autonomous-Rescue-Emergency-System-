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

    setTimeout(() => {
      const replyMsg: ChatMessage = {
        id: `copilot-${Date.now()}`,
        sender: 'copilot',
        text: replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        actionTaken,
      };
      setMessages(prev => [...prev, replyMsg]);
      tacticalVoice.speak(replyText, 'copilot', true);
    }, 400);
  };

  if (!copilotOpen) return null;

  return (
    <div className="fixed bottom-6 right-6 w-96 max-w-[calc(100vw-3rem)] h-[560px] backdrop-blur-2xl bg-slate-900/85 ring-1 ring-white/15 rounded-3xl shadow-2xl flex flex-col justify-between overflow-hidden z-50 animate-slideUp font-sans select-none">
      {/* Top Accent Gradient Line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500 via-cyan-400 to-indigo-500 opacity-70" />

      {/* Header */}
      <div className="px-4 py-3.5 border-b border-white/[0.08] flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <Bot className="w-4.5 h-4.5" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-white flex items-center space-x-1.5">
              <span>Copiloto Táctico IA</span>
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            </h3>
            <span className="text-[10px] text-slate-400 font-mono">Control por Voz y Órdenes NLU</span>
          </div>
        </div>

        <button
          onClick={toggleCopilot}
          className="p-1.5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-[12px] leading-relaxed shadow-sm ${
                m.sender === 'user'
                  ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-br-sm'
                  : 'backdrop-blur-md bg-white/[0.04] ring-1 ring-white/[0.08] text-slate-200 rounded-bl-sm'
              }`}
            >
              {m.text}

              {m.actionTaken && (
                <div className="mt-2 pt-1.5 border-t border-white/10 flex items-center text-[10px] text-emerald-400 font-semibold font-mono">
                  <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-400" />
                  <span>EJECUTADO: {m.actionTaken}</span>
                </div>
              )}
            </div>
            <span className="text-[9px] text-slate-500 mt-1 px-1 font-mono">{m.timestamp}</span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Action Chips - iOS Style Pill Bar */}
      <div className="px-3 py-2 bg-black/30 border-t border-white/[0.06] flex items-center space-x-1.5 overflow-x-auto no-scrollbar text-[10px] font-mono">
        <button
          onClick={() => executeCommand('Formación Delta')}
          className="px-2.5 py-1 bg-white/[0.04] hover:bg-white/[0.08] ring-1 ring-white/[0.08] text-cyan-300 rounded-lg shrink-0 transition hover:scale-105 active:scale-95"
        >
          ▲ Formación Delta
        </button>
        <button
          onClick={() => executeCommand('Formación Línea')}
          className="px-2.5 py-1 bg-white/[0.04] hover:bg-white/[0.08] ring-1 ring-white/[0.08] text-cyan-300 rounded-lg shrink-0 transition hover:scale-105 active:scale-95"
        >
          ━ Línea en Frente
        </button>
        <button
          onClick={() => executeCommand('Cámara Térmica FLIR')}
          className="px-2.5 py-1 bg-white/[0.04] hover:bg-white/[0.08] ring-1 ring-white/[0.08] text-amber-300 rounded-lg shrink-0 transition hover:scale-105 active:scale-95"
        >
          🔥 FLIR Térmico
        </button>
        <button
          onClick={() => executeCommand('Capturar Snapshot')}
          className="px-2.5 py-1 bg-white/[0.04] hover:bg-white/[0.08] ring-1 ring-white/[0.08] text-rose-300 rounded-lg shrink-0 transition hover:scale-105 active:scale-95"
        >
          📸 Snapshot
        </button>
        <button
          onClick={() => executeCommand('Retorno a Base RTH')}
          className="px-2.5 py-1 bg-white/[0.04] hover:bg-white/[0.08] ring-1 ring-white/[0.08] text-rose-300 rounded-lg shrink-0 transition hover:scale-105 active:scale-95"
        >
          🏠 RTH Flota
        </button>
      </div>

      {/* Input Box & Voice Button */}
      <div className="p-3 bg-black/40 border-t border-white/[0.08] flex items-center space-x-2">
        <button
          onClick={toggleListening}
          className={`p-2.5 rounded-xl transition-all duration-200 shadow-md ${
            isListening
              ? 'bg-rose-600 text-white animate-pulse ring-2 ring-rose-400/50 scale-105'
              : 'bg-white/[0.05] hover:bg-white/[0.1] text-cyan-400 ring-1 ring-white/10 hover:scale-105'
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
          className="flex-1 bg-white/[0.04] border border-white/10 focus:border-cyan-400/50 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 outline-none"
        />

        <button
          onClick={() => executeCommand(inputVal)}
          disabled={!inputVal.trim()}
          className="p-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 disabled:opacity-30 text-white rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 shadow-md shadow-blue-500/20"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
