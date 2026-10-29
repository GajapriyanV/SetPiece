package debates

import "errors"

var ErrDraining = errors.New("room runtime is draining")

// Wait for admitted creation/ready commands to finish before acknowledging
// drain. Existing timers, voting, chat, reconnects and finalization continue.
func (s *Service) SetDraining(draining bool) {
	s.admission.Lock()
	defer s.admission.Unlock()
	s.draining = draining
}
func (s *Service) Draining() bool {
	s.admission.RLock()
	defer s.admission.RUnlock()
	return s.draining
}
