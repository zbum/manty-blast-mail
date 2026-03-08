package websocket

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/rs/zerolog/log"

	ws "github.com/gorilla/websocket"
)

const (
	// Time allowed to write a message to the peer.
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer.
	pongWait = 60 * time.Second

	// Send pings to peer with this period. Must be less than pongWait.
	pingPeriod = (pongWait * 9) / 10

	// Maximum message size allowed from peer.
	maxMessageSize = 4096
)

var upgrader = ws.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for development
	},
}

// RateChanger is the interface for setting send rate on a campaign.
type RateChanger interface {
	SetRate(campaignID uint64, ratePerSec int) error
}

// Handler handles WebSocket connections.
type Handler struct {
	hub         *Hub
	rateChanger RateChanger
}

// NewHandler creates a new WebSocket handler.
func NewHandler(hub *Hub, rateChanger RateChanger) *Handler {
	return &Handler{
		hub:         hub,
		rateChanger: rateChanger,
	}
}

// clientMessage represents an incoming WebSocket message from a client.
type clientMessage struct {
	Action     string `json:"action"`
	CampaignID uint64 `json:"campaign_id,omitempty"`
	Rate       int    `json:"rate,omitempty"`
}

// ServeWS handles WebSocket upgrade and manages the connection.
func (h *Handler) ServeWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Error().Err(err).Msg("websocket upgrade failed")
		return
	}

	client := &Client{
		hub:         h.hub,
		conn:        conn,
		send:        make(chan []byte, 256),
		subscribeTo: make(map[uint64]bool),
	}

	h.hub.register <- client

	go h.writePump(client)
	go h.readPump(client)
}

// readPump reads messages from the WebSocket connection and handles commands.
func (h *Handler) readPump(client *Client) {
	defer func() {
		h.hub.unregister <- client
		client.conn.Close()
	}()

	client.conn.SetReadLimit(maxMessageSize)
	client.conn.SetReadDeadline(time.Now().Add(pongWait))
	client.conn.SetPongHandler(func(string) error {
		client.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := client.conn.ReadMessage()
		if err != nil {
			if ws.IsUnexpectedCloseError(err, ws.CloseGoingAway, ws.CloseAbnormalClosure) {
				log.Error().Err(err).Msg("websocket read error")
			}
			break
		}

		var msg clientMessage
		if err := json.Unmarshal(message, &msg); err != nil {
			log.Warn().Err(err).Msg("invalid websocket message")
			h.sendError(client, "invalid message format")
			continue
		}

		h.handleMessage(client, msg)
	}
}

// handleMessage processes a client message based on its action.
func (h *Handler) handleMessage(client *Client, msg clientMessage) {
	switch msg.Action {
	case "subscribe":
		if msg.CampaignID == 0 {
			h.sendError(client, "campaign_id is required for subscribe")
			return
		}
		client.mu.Lock()
		client.subscribeTo[msg.CampaignID] = true
		client.mu.Unlock()
		h.sendAck(client, "subscribed", msg.CampaignID)

	case "unsubscribe":
		if msg.CampaignID == 0 {
			h.sendError(client, "campaign_id is required for unsubscribe")
			return
		}
		client.mu.Lock()
		delete(client.subscribeTo, msg.CampaignID)
		client.mu.Unlock()
		h.sendAck(client, "unsubscribed", msg.CampaignID)

	case "set_rate":
		if msg.CampaignID == 0 || msg.Rate == 0 {
			h.sendError(client, "campaign_id and rate are required for set_rate")
			return
		}
		if err := h.rateChanger.SetRate(msg.CampaignID, msg.Rate); err != nil {
			h.sendError(client, err.Error())
			return
		}
		h.sendAck(client, "rate_updated", msg.CampaignID)

	case "ping":
		h.sendJSON(client, map[string]interface{}{
			"event": "pong",
		})

	default:
		h.sendError(client, "unknown action: "+msg.Action)
	}
}

// writePump pumps messages from the send channel to the WebSocket connection.
func (h *Handler) writePump(client *Client) {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		client.conn.Close()
	}()

	for {
		select {
		case message, ok := <-client.send:
			client.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Hub closed the channel.
				client.conn.WriteMessage(ws.CloseMessage, []byte{})
				return
			}

			if err := client.conn.WriteMessage(ws.TextMessage, message); err != nil {
				return
			}

			// Write any queued messages as separate frames.
			n := len(client.send)
			for i := 0; i < n; i++ {
				if err := client.conn.WriteMessage(ws.TextMessage, <-client.send); err != nil {
					return
				}
			}

		case <-ticker.C:
			client.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := client.conn.WriteMessage(ws.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// sendJSON sends a JSON message to a client.
func (h *Handler) sendJSON(client *Client, data interface{}) {
	b, err := json.Marshal(data)
	if err != nil {
		return
	}
	select {
	case client.send <- b:
	default:
	}
}

// sendError sends an error message to a client.
func (h *Handler) sendError(client *Client, message string) {
	h.sendJSON(client, map[string]interface{}{
		"event": "error",
		"data":  map[string]string{"message": message},
	})
}

// sendAck sends an acknowledgment message to a client.
func (h *Handler) sendAck(client *Client, action string, campaignID uint64) {
	h.sendJSON(client, map[string]interface{}{
		"event":       "ack",
		"action":      action,
		"campaign_id": campaignID,
	})
}
