package websocket

import (
	"encoding/json"
	"sync"

	ws "github.com/gorilla/websocket"
)

type Client struct {
	hub         *Hub
	conn        *ws.Conn
	send        chan []byte
	subscribeTo map[uint64]bool
	mu          sync.Mutex
}

type Hub struct {
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	mu         sync.RWMutex
}

func NewHub() *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		broadcast:  make(chan []byte, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			h.mu.Unlock()
		case message := <-h.broadcast:
			h.mu.RLock()
			var slow []*Client
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					slow = append(slow, client)
				}
			}
			h.mu.RUnlock()
			if len(slow) > 0 {
				h.mu.Lock()
				for _, client := range slow {
					if _, ok := h.clients[client]; ok {
						delete(h.clients, client)
						close(client.send)
					}
				}
				h.mu.Unlock()
			}
		}
	}
}

// BroadcastToCampaign sends a message to clients subscribed to a campaign.
func (h *Hub) BroadcastToCampaign(campaignID uint64, event string, data interface{}) {
	msg := map[string]interface{}{
		"event":       event,
		"campaign_id": campaignID,
		"data":        data,
	}
	b, err := json.Marshal(msg)
	if err != nil {
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for client := range h.clients {
		client.mu.Lock()
		subscribed := client.subscribeTo[campaignID]
		client.mu.Unlock()
		if subscribed {
			select {
			case client.send <- b:
			default:
			}
		}
	}
}

// BroadcastAll sends to all connected clients.
func (h *Hub) BroadcastAll(event string, data interface{}) {
	msg := map[string]interface{}{
		"event": event,
		"data":  data,
	}
	b, err := json.Marshal(msg)
	if err != nil {
		return
	}
	h.broadcast <- b
}
