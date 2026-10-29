package auth

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"math/big"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const testUserID = "11111111-1111-4111-8111-111111111111"

func ecKey(t *testing.T) *ecdsa.PrivateKey {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	return key
}
func publicJWK(key *ecdsa.PrivateKey, kid string) jwk {
	return jwk{Kid: kid, Kty: "EC", Alg: "ES256", Use: "sig", Crv: "P-256",
		X: base64.RawURLEncoding.EncodeToString(key.X.FillBytes(make([]byte, 32))),
		Y: base64.RawURLEncoding.EncodeToString(key.Y.FillBytes(make([]byte, 32)))}
}
func goodClaims(issuer string, now time.Time) Claims {
	return Claims{RegisteredClaims: jwt.RegisteredClaims{
		Issuer: issuer, Subject: testUserID, Audience: jwt.ClaimStrings{"authenticated"},
		ExpiresAt: jwt.NewNumericDate(now.Add(time.Hour)), IssuedAt: jwt.NewNumericDate(now.Add(-time.Minute)),
	}, Role: "authenticated"}
}
func sign(t *testing.T, claims Claims, key any, method jwt.SigningMethod, kid string) string {
	t.Helper()
	token := jwt.NewWithClaims(method, claims)
	if kid != "" {
		token.Header["kid"] = kid
	}
	raw, err := token.SignedString(key)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func TestVerifyClaimsAndSignature(t *testing.T) {
	key := ecKey(t)
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		if r.URL.Path != "/auth/v1/.well-known/jwks.json" {
			t.Errorf("unexpected path %s", r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"keys": []jwk{publicJWK(key, "one")}})
	}))
	defer server.Close()
	now := time.Now().UTC()
	v := NewVerifier(server.URL, "authenticated", []string{"ES256", "RS256"})
	v.now = func() time.Time { return now }
	tests := []struct {
		name       string
		change     func(*Claims)
		kid        string
		signingKey any
		method     jwt.SigningMethod
		ok         bool
	}{
		{name: "valid", kid: "one", ok: true},
		{name: "wrong issuer", kid: "one", change: func(c *Claims) { c.Issuer = "https://wrong.example/auth/v1" }},
		{name: "wrong audience", kid: "one", change: func(c *Claims) { c.Audience = jwt.ClaimStrings{"service_role"} }},
		{name: "missing audience", kid: "one", change: func(c *Claims) { c.Audience = nil }},
		{name: "expired", kid: "one", change: func(c *Claims) { c.ExpiresAt = jwt.NewNumericDate(now.Add(-time.Minute)) }},
		{name: "missing expiry", kid: "one", change: func(c *Claims) { c.ExpiresAt = nil }},
		{name: "future issued", kid: "one", change: func(c *Claims) { c.IssuedAt = jwt.NewNumericDate(now.Add(time.Hour)) }},
		{name: "not before", kid: "one", change: func(c *Claims) { c.NotBefore = jwt.NewNumericDate(now.Add(time.Hour)) }},
		{name: "missing subject", kid: "one", change: func(c *Claims) { c.Subject = "" }},
		{name: "non UUID", kid: "one", change: func(c *Claims) { c.Subject = "another-user" }},
		{name: "service role", kid: "one", change: func(c *Claims) { c.Role = "service_role" }},
		{name: "missing kid"},
		{name: "unknown kid", kid: "unknown"},
		{name: "bad signature", kid: "one", signingKey: ecKey(t)},
		{name: "symmetric algorithm", kid: "one", signingKey: []byte("a-secret-not-a-public-key"), method: jwt.SigningMethodHS256},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			claims := goodClaims(server.URL+"/auth/v1", now)
			if tc.change != nil {
				tc.change(&claims)
			}
			signer := tc.signingKey
			if signer == nil {
				signer = key
			}
			method := tc.method
			if method == nil {
				method = jwt.SigningMethodES256
			}
			identity, err := v.Verify(context.Background(), sign(t, claims, signer, method, tc.kid))
			if tc.ok {
				if err != nil || identity.ID != testUserID {
					t.Fatalf("identity=%v error=%v", identity, err)
				}
			} else if !errors.Is(err, ErrUnauthorized) {
				t.Fatalf("expected unauthorized, got %v", err)
			}
		})
	}
	if requests.Load() != 1 {
		t.Fatalf("expected one cached fetch, got %d", requests.Load())
	}
}

func TestKeyRotationAndRevocation(t *testing.T) {
	first, second := ecKey(t), ecKey(t)
	var keys atomic.Value
	keys.Store([]jwk{publicJWK(first, "first")})
	var unavailable atomic.Bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if unavailable.Load() {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"keys": keys.Load()})
	}))
	defer server.Close()
	now := time.Now()
	v := NewVerifier(server.URL, "authenticated", []string{"ES256"})
	v.now = func() time.Time { return now }
	token := func(k *ecdsa.PrivateKey, kid string) string {
		return sign(t, goodClaims(server.URL+"/auth/v1", now), k, jwt.SigningMethodES256, kid)
	}
	if _, err := v.Verify(context.Background(), token(first, "first")); err != nil {
		t.Fatal(err)
	}
	now = now.Add(11 * time.Second)
	keys.Store([]jwk{publicJWK(first, "first"), publicJWK(second, "second")})
	if _, err := v.Verify(context.Background(), token(second, "second")); err != nil {
		t.Fatalf("rotation failed: %v", err)
	}
	now = now.Add(6 * time.Minute)
	keys.Store([]jwk{publicJWK(second, "second")})
	if _, err := v.Verify(context.Background(), token(first, "first")); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("revoked key: %v", err)
	}
	now = now.Add(6 * time.Minute)
	unavailable.Store(true)
	if _, err := v.Verify(context.Background(), token(second, "second")); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("expired cache must fail closed: %v", err)
	}
}

func TestConcurrentVerification(t *testing.T) {
	key := ecKey(t)
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		_ = json.NewEncoder(w).Encode(map[string]any{"keys": []jwk{publicJWK(key, "one")}})
	}))
	defer server.Close()
	v := NewVerifier(server.URL, "authenticated", []string{"ES256"})
	raw := sign(t, goodClaims(server.URL+"/auth/v1", time.Now()), key, jwt.SigningMethodES256, "one")
	var wg sync.WaitGroup
	for i := 0; i < 32; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := v.Verify(context.Background(), raw); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	if requests.Load() != 1 {
		t.Fatalf("concurrent cache misses made %d requests", requests.Load())
	}
}

func TestRS256(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"keys": []jwk{{Kid: "rsa", Kty: "RSA", Alg: "RS256", Use: "sig",
			N: base64.RawURLEncoding.EncodeToString(key.N.Bytes()), E: base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.E)).Bytes())}}})
	}))
	defer server.Close()
	v := NewVerifier(server.URL, "authenticated", []string{"RS256"})
	raw := sign(t, goodClaims(server.URL+"/auth/v1", time.Now()), key, jwt.SigningMethodRS256, "rsa")
	if _, err := v.Verify(context.Background(), raw); err != nil {
		t.Fatal(err)
	}
}

func TestRejectRedirectAndMalformedJWKS(t *testing.T) {
	key := ecKey(t)
	for _, body := range []string{"not json", "{\"keys\":[{\"kid\":\"one\",\"kty\":\"oct\",\"alg\":\"HS256\"}]}"} {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte(body)) }))
		v := NewVerifier(server.URL, "authenticated", []string{"ES256"})
		raw := sign(t, goodClaims(server.URL+"/auth/v1", time.Now()), key, jwt.SigningMethodES256, "one")
		if _, err := v.Verify(context.Background(), raw); err == nil {
			t.Fatal("accepted malformed keys")
		}
		server.Close()
	}
	var redirected atomic.Bool
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { redirected.Store(true) }))
	defer target.Close()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, target.URL, 302) }))
	defer server.Close()
	v := NewVerifier(server.URL, "authenticated", []string{"ES256"})
	raw := sign(t, goodClaims(server.URL+"/auth/v1", time.Now()), key, jwt.SigningMethodES256, "one")
	if _, err := v.Verify(context.Background(), raw); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("redirect error %v", err)
	}
	if redirected.Load() {
		t.Fatal("followed redirect")
	}
}
