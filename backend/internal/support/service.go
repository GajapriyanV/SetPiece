package support

import (
	"context"
	"encoding/json"
	"github.com/GajapriyanV/SetPiece/backend/internal/application"
	"github.com/jackc/pgx/v5"
	"strings"
)

type Service struct {
	application.Store
	// PrivateContactView avoids granting access to the managed Auth schema.
	PrivateContactView bool
}
type Ticket struct {
	Subject string `json:"subject"`
	Message string `json:"message"`
}

func (s *Service) Create(ctx context.Context, user string, in Ticket) (json.RawMessage, error) {
	in.Subject = strings.TrimSpace(in.Subject)
	in.Message = strings.TrimSpace(in.Message)
	if !application.Text(in.Subject, 200) || !application.Text(in.Message, 2000) {
		return nil, application.ErrInvalid
	}
	return s.Write(ctx, func(tx pgx.Tx) (json.RawMessage, error) {
		// Contact identity comes only from the verified subject and canonical Auth/profile records.
		query := `INSERT INTO public.contact_tickets(user_id,name,email,subject,message)
 SELECT u.id,coalesce(nullif(p.name,''),p.username,'Unknown'),coalesce(u.email,''),$2,$3 FROM auth.users u
 LEFT JOIN public.profiles p ON p.id=u.id WHERE u.id=$1::uuid`
		if s.PrivateContactView {
			query = strings.Replace(query, "auth.users", "setpiece_runtime.contact_identities", 1)
		}
		tag, e := tx.Exec(ctx, query, user, in.Subject, in.Message)
		if e != nil {
			return nil, e
		}
		if tag.RowsAffected() != 1 {
			return nil, application.ErrNotFound
		}
		return application.OK, nil
	})
}
func (s *Service) List(ctx context.Context, user, filter string) (json.RawMessage, error) {
	if filter != "" && filter != "all" && filter != "unreviewed" {
		return nil, application.ErrInvalid
	}
	if filter == "" {
		filter = "unreviewed"
	}
	if e := application.Admin(ctx, s.Pool, user); e != nil {
		return nil, e
	}
	return application.JSON(ctx, s.Pool, `WITH items AS (
 SELECT id,name,email,subject,message,is_reviewed,created_at,user_id FROM public.contact_tickets
 WHERE ($1='all' OR is_reviewed=false) ORDER BY created_at DESC,id DESC LIMIT 100)
 SELECT jsonb_build_object('tickets',coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY created_at DESC,id DESC) FROM items i),'[]'::jsonb),
 'total',(SELECT count(*) FROM public.contact_tickets WHERE ($1='all' OR is_reviewed=false)))`, filter)
}
func (s *Service) Review(ctx context.Context, user, id string) (json.RawMessage, error) {
	if !application.ID(id) {
		return nil, application.ErrInvalid
	}
	return s.Write(ctx, func(tx pgx.Tx) (json.RawMessage, error) {
		if e := application.Admin(ctx, tx, user); e != nil {
			return nil, e
		}
		tag, e := tx.Exec(ctx, "UPDATE public.contact_tickets SET is_reviewed=true WHERE id=$1", id)
		if e != nil {
			return nil, e
		}
		if tag.RowsAffected() == 0 {
			return nil, application.ErrNotFound
		}
		return application.OK, nil
	})
}
