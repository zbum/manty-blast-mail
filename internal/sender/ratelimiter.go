package sender

import (
	"context"
	"sync"

	"golang.org/x/time/rate"
)

type RateLimiter struct {
	limiter *rate.Limiter
	mu      sync.RWMutex
	current int
}

func NewRateLimiter(ratePerSec int) *RateLimiter {
	return &RateLimiter{
		limiter: rate.NewLimiter(rate.Limit(ratePerSec), ratePerSec),
		current: ratePerSec,
	}
}

func (rl *RateLimiter) Wait(ctx context.Context) error {
	rl.mu.RLock()
	l := rl.limiter
	rl.mu.RUnlock()
	return l.Wait(ctx)
}

func (rl *RateLimiter) SetRate(ratePerSec int) {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	rl.limiter.SetLimit(rate.Limit(ratePerSec))
	rl.limiter.SetBurst(ratePerSec)
	rl.current = ratePerSec
}

func (rl *RateLimiter) GetRate() int {
	rl.mu.RLock()
	defer rl.mu.RUnlock()
	return rl.current
}
