import { useEffect, useRef, useCallback, useState } from 'react';

interface WSMessage {
  event: string;
  campaign_id?: number;
  data: any;
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const listenersRef = useRef<Map<string, Set<(data: any) => void>>>(new Map());

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => {
      setIsConnected(false);
      setTimeout(() => {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
      }, 3000);
    };

    ws.onmessage = (evt) => {
      try {
        const msg: WSMessage = JSON.parse(evt.data);
        const listeners = listenersRef.current.get(msg.event);
        if (listeners) {
          listeners.forEach((cb) => cb(msg));
        }
      } catch (e) {
        console.error('WS parse error', e);
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  const subscribe = useCallback((campaignId: number) => {
    wsRef.current?.send(JSON.stringify({ action: 'subscribe', campaign_id: campaignId }));
  }, []);

  const unsubscribe = useCallback((campaignId: number) => {
    wsRef.current?.send(JSON.stringify({ action: 'unsubscribe', campaign_id: campaignId }));
  }, []);

  const on = useCallback((event: string, callback: (data: any) => void) => {
    if (!listenersRef.current.has(event)) {
      listenersRef.current.set(event, new Set());
    }
    listenersRef.current.get(event)!.add(callback);
    return () => {
      listenersRef.current.get(event)?.delete(callback);
    };
  }, []);

  return { isConnected, subscribe, unsubscribe, on };
}
