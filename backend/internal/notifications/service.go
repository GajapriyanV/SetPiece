package notifications

import (
	"context"
	"encoding/json"
	"github.com/GajapriyanV/SetPiece/backend/internal/application"
	"github.com/jackc/pgx/v5"
)

type Service struct{ application.Store }

func (s *Service) List(ctx context.Context, user string) (json.RawMessage, error) {
	return application.JSON(ctx, s.Pool, `WITH items AS(
 SELECT n.id,n.type,n.thread_id,n.reply_id,n.is_read,n.created_at,n.count,
 CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('username',p.username,'avatar_url',p.avatar_url) END actor,
 CASE WHEN t.id IS NULL THEN NULL ELSE jsonb_build_object('title',t.title) END thread
 FROM public.notifications n LEFT JOIN public.profiles p ON p.id=n.actor_id LEFT JOIN public.forum_threads t ON t.id=n.thread_id
 WHERE n.user_id=$1::uuid ORDER BY n.created_at DESC,n.id DESC LIMIT 20)
 SELECT jsonb_build_object('notifications',coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.created_at DESC,i.id DESC) FROM items i),'[]'::jsonb),
 'unreadCount',(SELECT count(*) FROM public.notifications WHERE user_id=$1::uuid AND is_read=false))`, user)
}
func (s *Service) Read(ctx context.Context, user, id string) (json.RawMessage, error) {
	if id != "" && !application.ID(id) {
		return nil, application.ErrInvalid
	}
	return s.Write(ctx, func(tx pgx.Tx) (json.RawMessage, error) {
		var target any
		if id != "" {
			target = id
		}
		_, e := tx.Exec(ctx, "UPDATE public.notifications SET is_read=true WHERE user_id=$1::uuid AND ($2::uuid IS NULL OR id=$2) AND is_read=false", user, target)
		// Same response for missing, other-user and already-read notifications.
		return application.OK, e
	})
}
