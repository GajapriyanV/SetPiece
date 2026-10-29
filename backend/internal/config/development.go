package config

import (
	"errors"
	"net/url"
	"regexp"
	"strings"
)

var projectRef = regexp.MustCompile(`^[a-z0-9]{20}$`)
var sessionHost = regexp.MustCompile(`^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$`)

// This is an explicit existing-development-project path, never a fixture URI.
// A session connection is required by ownership's dedicated advisory lock.
func ValidateDevelopmentDatabaseURI(uri, issuer, ref, role string) error {
	invalid := errors.New("development database must match the explicit Supabase project, role and port 5432 with verified TLS")
	if !projectRef.MatchString(ref) || (role != "setpiece_app" && role != "postgres") {
		return invalid
	}
	if issuer != "https://"+ref+".supabase.co" {
		return invalid
	}
	u, e := url.Parse(uri)
	if e != nil || (u.Scheme != "postgres" && u.Scheme != "postgresql") || u.User == nil || u.Path != "/postgres" || u.Fragment != "" || u.Port() != "5432" {
		return invalid
	}
	password, ok := u.User.Password()
	if !ok || strings.TrimSpace(password) == "" {
		return invalid
	}
	user := u.User.Username()
	if u.Hostname() == "db."+ref+".supabase.co" {
		if user != role {
			return invalid
		}
	} else if !sessionHost.MatchString(u.Hostname()) || user != role+"."+ref {
		return invalid
	}
	if !verifiedDatabaseOptions(u) {
		return invalid
	}
	return nil
}
