package auth

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"math/big"
	"net/http"
	"regexp"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

var (
	ErrUnauthorized = errors.New("invalid authentication")
	ErrUnavailable  = errors.New("authentication keys unavailable")
	userIDPattern   = regexp.MustCompile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
)

type Identity struct {
	ID        string
	ExpiresAt time.Time
}

type Claims struct {
	jwt.RegisteredClaims
	Role string `json:"role"`
}

type signingKey struct {
	algorithm string
	public    any
}

type Verifier struct {
	issuer     string
	audience   string
	algorithms []string
	client     *http.Client
	mu         sync.Mutex
	keys       map[string]signingKey
	expiresAt  time.Time
	lastFetch  time.Time
	now        func() time.Time
}

func NewVerifier(supabaseURL, audience string, algorithms []string) *Verifier {
	return &Verifier{
		issuer:     supabaseURL + "/auth/v1",
		audience:   audience,
		algorithms: append([]string(nil), algorithms...),
		client: &http.Client{
			Timeout:       3 * time.Second,
			CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
		},
		now: time.Now,
	}
}

func (v *Verifier) Verify(ctx context.Context, raw string) (Identity, error) {
	if len(raw) == 0 || len(raw) > 16384 {
		return Identity{}, ErrUnauthorized
	}
	claims := &Claims{}
	_, err := jwt.ParseWithClaims(raw, claims, func(token *jwt.Token) (any, error) {
		kid, ok := token.Header["kid"].(string)
		if !ok || kid == "" || len(kid) > 256 {
			return nil, ErrUnauthorized
		}
		key, err := v.key(ctx, kid)
		if err != nil {
			return nil, err
		}
		if token.Method.Alg() != key.algorithm {
			return nil, ErrUnauthorized
		}
		return key.public, nil
	}, jwt.WithValidMethods(v.algorithms), jwt.WithIssuer(v.issuer),
		jwt.WithAudience(v.audience), jwt.WithExpirationRequired(),
		jwt.WithIssuedAt(), jwt.WithLeeway(15*time.Second), jwt.WithTimeFunc(v.now))
	if err != nil {
		if errors.Is(err, ErrUnavailable) {
			return Identity{}, ErrUnavailable
		}
		return Identity{}, ErrUnauthorized
	}
	if claims.Role != "authenticated" || !userIDPattern.MatchString(claims.Subject) {
		return Identity{}, ErrUnauthorized
	}
	return Identity{ID: claims.Subject, ExpiresAt: claims.ExpiresAt.Time}, nil
}

// A short bounded cache permits key rotation without trusting stale keys
// indefinitely. Unknown-kid requests cannot trigger a fetch more than once
// every ten seconds. Fetches are serialized and bounded by the HTTP timeout.
func (v *Verifier) key(ctx context.Context, kid string) (signingKey, error) {
	v.mu.Lock()
	defer v.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return signingKey{}, ErrUnavailable
	}
	now := v.now()
	if now.Before(v.expiresAt) {
		if key, ok := v.keys[kid]; ok {
			return key, nil
		}
	}
	if !v.lastFetch.IsZero() && now.Sub(v.lastFetch) < 10*time.Second {
		if !now.Before(v.expiresAt) {
			return signingKey{}, ErrUnavailable
		}
		return signingKey{}, ErrUnauthorized
	}
	v.lastFetch = now
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, v.issuer+"/.well-known/jwks.json", nil)
	if err != nil {
		return signingKey{}, ErrUnavailable
	}
	resp, err := v.client.Do(req)
	if err != nil {
		return signingKey{}, ErrUnavailable
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return signingKey{}, ErrUnavailable
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, (1<<20)+1))
	if err != nil || len(body) > 1<<20 {
		return signingKey{}, ErrUnavailable
	}
	var set struct {
		Keys []jwk `json:"keys"`
	}
	if json.Unmarshal(body, &set) != nil || len(set.Keys) > 32 {
		return signingKey{}, ErrUnavailable
	}
	keys := make(map[string]signingKey)
	for _, k := range set.Keys {
		if k.Kid == "" || (k.Use != "" && k.Use != "sig") {
			continue
		}
		key, ok := parseKey(k)
		if !ok {
			continue
		}
		if _, duplicate := keys[k.Kid]; duplicate {
			return signingKey{}, ErrUnavailable
		}
		keys[k.Kid] = key
	}
	v.keys = keys
	v.expiresAt = now.Add(5 * time.Minute)
	key, ok := keys[kid]
	if !ok {
		return signingKey{}, ErrUnauthorized
	}
	return key, nil
}

type jwk struct {
	Kid string `json:"kid"`
	Kty string `json:"kty"`
	Alg string `json:"alg"`
	Use string `json:"use"`
	Crv string `json:"crv"`
	X   string `json:"x"`
	Y   string `json:"y"`
	N   string `json:"n"`
	E   string `json:"e"`
}

func parseKey(k jwk) (signingKey, bool) {
	decode := func(s string) ([]byte, bool) {
		b, err := base64.RawURLEncoding.DecodeString(s)
		return b, err == nil && len(b) > 0
	}
	switch {
	case k.Kty == "EC" && k.Alg == "ES256" && k.Crv == "P-256":
		x, okX := decode(k.X)
		y, okY := decode(k.Y)
		if !okX || !okY || len(x) != 32 || len(y) != 32 {
			return signingKey{}, false
		}
		key := &ecdsa.PublicKey{Curve: elliptic.P256(), X: new(big.Int).SetBytes(x), Y: new(big.Int).SetBytes(y)}
		if !key.Curve.IsOnCurve(key.X, key.Y) {
			return signingKey{}, false
		}
		return signingKey{"ES256", key}, true
	case k.Kty == "RSA" && k.Alg == "RS256":
		n, okN := decode(k.N)
		e, okE := decode(k.E)
		if !okN || !okE || len(n) < 256 || len(n) > 1024 || len(e) > 4 {
			return signingKey{}, false
		}
		exponent := new(big.Int).SetBytes(e).Int64()
		if exponent < 3 || exponent > 2147483647 || exponent%2 == 0 {
			return signingKey{}, false
		}
		return signingKey{"RS256", &rsa.PublicKey{N: new(big.Int).SetBytes(n), E: int(exponent)}}, true
	}
	return signingKey{}, false
}
