package mailer

import (
	"fmt"
)

// RenderICalendar renders an iCalendar template string with the given data map.
// Uses the same template rendering as other templates but specifically for .ics content.
func RenderICalendar(icsTemplate string, data map[string]string) (string, error) {
	result, err := RenderTemplate(icsTemplate, data)
	if err != nil {
		return "", fmt.Errorf("render icalendar: %w", err)
	}
	return result, nil
}
