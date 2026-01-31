import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';

export const useWebSocket = () => {
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<number | null>(null);

  useEffect(() => {
    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const socketUrl = `${protocol}//${host}/ws`;

      ws.current = new WebSocket(socketUrl);

      ws.current.onopen = () => {
        console.log('WebSocket Connected');
        if (reconnectTimeout.current) {
          clearTimeout(reconnectTimeout.current);
          reconnectTimeout.current = null;
        }
      };

      ws.current.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        const { updateState, activeExtractions } = useAppStore.getState();

        switch (msg.type) {
          case 'state':
            updateState({ ...msg.data }, 'merge');
            break;
          case 'maintenance:started':
            updateState({ isMaintenance: true });
            break;
          case 'maintenance:finished':
            updateState({ isMaintenance: false });
            break;
          case 'run:started':
            updateState({ currentRun: msg.data, isRunning: true, files: [] });
            break;
          case 'run:progress':
            updateState({ initMessage: msg.data.message });
            break;
          case 'extraction:started':
            updateState({ activeExtractions: [...activeExtractions, msg.data] });
            break;
          case 'extraction:stopped':
            updateState({ activeExtractions: activeExtractions.filter((p) => p !== msg.data) });
            break;
          case 'run:updated':
          case 'run:completed':
          case 'run:cancelled':
            updateState({ currentRun: msg.data });
            break;
          case 'health:updated':
            updateState({ health: msg.data });
            break;
          default:
            console.warn('Unknown WebSocket message type:', msg.type);
        }
      };

      ws.current.onclose = () => {
        console.log('WebSocket Disconnected, reconnecting...');
        reconnectTimeout.current = window.setTimeout(() => {
          connect();
        }, 3000);
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket Error:', error);
        ws.current?.close();
      };
    };

    connect();

    return () => {
      if (ws.current) {
        ws.current.onclose = null;
        ws.current.close();
      }
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
    };
  }, []);
};
