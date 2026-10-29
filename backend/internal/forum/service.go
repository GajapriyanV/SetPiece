package forum

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/GajapriyanV/SetPiece/backend/internal/application"
	"github.com/jackc/pgx/v5"
	"strings"
)

type Service struct{ application.Store }

var Flairs = []string{"General", "Player", "Transfer Window", "Premier League", "La Liga", "Serie A", "Bundesliga", "Ligue 1", "UCL", "Europa League", "International"}

func validFlair(v string) bool {
	for _, f := range Flairs {
		if f == v {
			return true
		}
	}
	return false
}

type NewThread struct {
	Title    string `json:"title"`
	Body     string `json:"body"`
	Flair    string `json:"flair"`
	Featured bool   `json:"is_featured"`
}
type NewReply struct {
	Body   string  `json:"body"`
	Parent *string `json:"parent_reply_id"`
}
type Patch struct {
	Featured *bool `json:"is_featured"`
	Closed   *bool `json:"is_closed"`
}
type Report struct {
	Type   string  `json:"target_type"`
	ID     string  `json:"target_id"`
	Reason string  `json:"reason"`
	Custom *string `json:"custom_reason"`
}

func (s *Service) Create(ctx context.Context, user string, in NewThread) (json.RawMessage, error) {
	in.Title = strings.TrimSpace(in.Title)
	in.Body = strings.TrimSpace(in.Body)
	if !application.Text(in.Title, 200) || !application.Text(in.Body, 2000) || !validFlair(in.Flair) {
		return nil, application.ErrInvalid
	}
	return s.Write(ctx, func(tx pgx.Tx) (json.RawMessage, error) {
		if in.Featured {
			if e := application.Admin(ctx, tx, user); e != nil {
				return nil, e
			}
		}
		return application.JSON(ctx, tx, `INSERT INTO public.forum_threads(author_id,title,body,flair,is_featured) VALUES($1,$2,$3,$4,$5) RETURNING jsonb_build_object('id',id)`, user, in.Title, in.Body, in.Flair, in.Featured)
	})
}

// Every thread mutation locks its parent first, including likes and subtree deletion.
func lockThread(ctx context.Context, tx pgx.Tx, id string) (*string, error) {
	var author *string
	e := tx.QueryRow(ctx, "SELECT author_id::text FROM public.forum_threads WHERE id=$1::uuid FOR NO KEY UPDATE", id).Scan(&author)
	if errors.Is(e, pgx.ErrNoRows) {
		return nil, application.ErrNotFound
	}
	return author, e
}
func closeExpired(ctx context.Context, tx pgx.Tx, id string) error {
	var due bool
	if e := tx.QueryRow(ctx, "SELECT NOT is_closed AND closes_at<=clock_timestamp() FROM public.forum_threads WHERE id=$1::uuid", id).Scan(&due); e != nil {
		return e
	}
	if !due {
		return nil
	}
	var recorded bool
	if e := tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM setpiece_runtime.forum_closures WHERE thread_id=$1::uuid)", id).Scan(&recorded); e != nil {
		return e
	}
	if !recorded {
		var reply, author *string
		e := tx.QueryRow(ctx, `SELECT id::text,author_id::text FROM public.forum_replies WHERE thread_id=$1::uuid AND parent_reply_id IS NULL ORDER BY upvotes_count DESC,created_at,id LIMIT 1`, id).Scan(&reply, &author)
		if e != nil && !errors.Is(e, pgx.ErrNoRows) {
			return e
		}
		if _, e = tx.Exec(ctx, "INSERT INTO setpiece_runtime.forum_closures(thread_id,reply_id,author_id) VALUES($1,$2,$3)", id, reply, author); e != nil {
			return e
		}
		if reply != nil {
			if _, e = tx.Exec(ctx, "UPDATE public.forum_replies SET is_mvp=true WHERE id=$1", *reply); e != nil {
				return e
			}
			if author != nil {
				if _, e = tx.Exec(ctx, "UPDATE public.profiles SET mvp_count=mvp_count+1 WHERE id=$1", *author); e != nil {
					return e
				}
				if _, e = tx.Exec(ctx, "INSERT INTO public.notifications(user_id,type,thread_id,reply_id,actor_id) VALUES($1,'mvp_awarded',$2,$3,NULL)", *author, id, *reply); e != nil {
					return e
				}
			}
		}
	}
	_, e := tx.Exec(ctx, "UPDATE public.forum_threads SET is_closed=true WHERE id=$1", id)
	return e
}
func openThread(ctx context.Context, tx pgx.Tx, id string) error {
	var closed bool
	if e := tx.QueryRow(ctx, "SELECT is_closed OR closes_at<=clock_timestamp() FROM public.forum_threads WHERE id=$1", id).Scan(&closed); e != nil {
		return e
	}
	if closed {
		return application.ErrClosed
	}
	return nil
}
func (s *Service) Reply(ctx context.Context, user, id string, in NewReply) (json.RawMessage, error) {
	in.Body = strings.TrimSpace(in.Body)
	if !application.ID(id) || !application.Text(in.Body, 2000) || (in.Parent != nil && !application.ID(*in.Parent)) {
		return nil, application.ErrInvalid
	}
	return s.Write(ctx, func(tx pgx.Tx) (json.RawMessage, error) {
		if _, e := lockThread(ctx, tx, id); e != nil {
			return nil, e
		}
		if e := openThread(ctx, tx, id); e != nil {
			return nil, e
		}
		if in.Parent != nil {
			// Walk only parents in THIS thread; the count also bounds existing malformed hierarchies.
			var valid bool
			e := tx.QueryRow(ctx, `WITH RECURSIVE chain AS (
 SELECT id,parent_reply_id,1 depth,ARRAY[id] seen FROM public.forum_replies WHERE id=$1 AND thread_id=$2
 UNION ALL SELECT r.id,r.parent_reply_id,c.depth+1,c.seen||r.id FROM chain c JOIN public.forum_replies r ON r.id=c.parent_reply_id
 WHERE r.thread_id=$2 AND c.depth<20 AND NOT r.id=ANY(c.seen))
 SELECT EXISTS(SELECT 1 FROM chain WHERE parent_reply_id IS NULL AND depth<20)`, *in.Parent, id).Scan(&valid)
			if e != nil {
				return nil, e
			}
			if !valid {
				return nil, application.ErrInvalid
			}
		}
		var replyID string
		if e := tx.QueryRow(ctx, "INSERT INTO public.forum_replies(thread_id,author_id,body,parent_reply_id) VALUES($1,$2,$3,$4) RETURNING id::text", id, user, in.Body, in.Parent).Scan(&replyID); e != nil {
			return nil, e
		}
		return application.JSON(ctx, tx, `SELECT jsonb_build_object('reply',`+replyJSON+` || jsonb_build_object('user_liked',false,'children','[]'::jsonb,'nested','[]'::jsonb)) FROM public.forum_replies r LEFT JOIN public.profiles p ON p.id=r.author_id WHERE r.id=$1`, replyID)
	})
}
func (s *Service) Update(ctx context.Context, user, id string, in Patch) (json.RawMessage, error) {
	if !application.ID(id) || (in.Featured == nil && in.Closed == nil) {
		return nil, application.ErrInvalid
	}
	return s.Write(ctx, func(tx pgx.Tx) (json.RawMessage, error) {
		if _, e := lockThread(ctx, tx, id); e != nil {
			return nil, e
		}
		if e := application.Admin(ctx, tx, user); e != nil {
			return nil, e
		}
		// Manual closure preserves legacy behavior: no MVP until natural expiry of an open thread.
		_, e := tx.Exec(ctx, "UPDATE public.forum_threads SET is_featured=coalesce($2,is_featured),is_closed=coalesce($3,is_closed) WHERE id=$1", id, in.Featured, in.Closed)
		return application.OK, e
	})
}
func targetThread(ctx context.Context, tx pgx.Tx, kind, id string) (string, error) {
	if kind == "thread" {
		return id, nil
	}
	var thread string
	e := tx.QueryRow(ctx, "SELECT thread_id::text FROM public.forum_replies WHERE id=$1", id).Scan(&thread)
	if errors.Is(e, pgx.ErrNoRows) {
		return "", application.ErrNotFound
	}
	return thread, e
}
func (s *Service) Like(ctx context.Context, user, kind, id string, liked bool) (json.RawMessage, error) {
	if !application.ID(id) || (kind != "thread" && kind != "reply") {
		return nil, application.ErrInvalid
	}
	return s.Write(ctx, func(tx pgx.Tx) (json.RawMessage, error) {
		thread, e := targetThread(ctx, tx, kind, id)
		if e != nil {
			return nil, e
		}
		if _, e = lockThread(ctx, tx, thread); e != nil {
			return nil, e
		}
		if kind == "reply" {
			if _, e = targetThread(ctx, tx, kind, id); e != nil {
				return nil, e
			}
		}
		// Likes on closed threads remain allowed; the finalized MVP stays unchanged.
		// Triggers alone maintain counters, received upvotes and notifications.
		if liked {
			_, e = tx.Exec(ctx, "INSERT INTO public.forum_likes(user_id,target_type,target_id) VALUES($1,$2,$3) ON CONFLICT(user_id,target_type,target_id) DO NOTHING", user, kind, id)
		} else {
			_, e = tx.Exec(ctx, "DELETE FROM public.forum_likes WHERE user_id=$1 AND target_type=$2 AND target_id=$3", user, kind, id)
		}
		if e != nil {
			return nil, e
		}
		table := "public.forum_threads"
		if kind == "reply" {
			table = "public.forum_replies"
		}
		return application.JSON(ctx, tx, "SELECT jsonb_build_object('liked',$2::boolean,'upvotes_count',upvotes_count) FROM "+table+" WHERE id=$1", id, liked)
	})
}
func (s *Service) Delete(ctx context.Context, user, kind, id string) (json.RawMessage, error) {
	if !application.ID(id) || (kind != "thread" && kind != "reply") {
		return nil, application.ErrInvalid
	}
	return s.Write(ctx, func(tx pgx.Tx) (json.RawMessage, error) {
		thread, e := targetThread(ctx, tx, kind, id)
		if e != nil {
			return nil, e
		}
		author, e := lockThread(ctx, tx, thread)
		if e != nil {
			return nil, e
		}
		if kind == "reply" {
			e = tx.QueryRow(ctx, "SELECT author_id::text FROM public.forum_replies WHERE id=$1 AND thread_id=$2", id, thread).Scan(&author)
			if errors.Is(e, pgx.ErrNoRows) {
				return nil, application.ErrNotFound
			}
			if e != nil {
				return nil, e
			}
		}
		if author == nil || *author != user {
			if e = application.Admin(ctx, tx, user); e != nil {
				return nil, e
			}
		}
		// Reject preexisting cross-thread descendants before FK cascades can delete them.
		var crossesThread bool
		if e = tx.QueryRow(ctx, `WITH RECURSIVE doomed AS(
 SELECT id,thread_id FROM public.forum_replies WHERE ($1='thread' AND thread_id=$2::uuid) OR ($1='reply' AND id=$3::uuid)
 UNION SELECT r.id,r.thread_id FROM public.forum_replies r JOIN doomed d ON r.parent_reply_id=d.id)
 SELECT EXISTS(SELECT 1 FROM doomed WHERE thread_id<>$2::uuid)`, kind, thread, id).Scan(&crossesThread); e != nil {
			return nil, e
		}
		if crossesThread {
			return nil, application.ErrInvalid
		}
		// Lock affected profiles in a stable order before firing the retained like triggers.
		rows, e := tx.Query(ctx, `SELECT id FROM public.profiles WHERE id IN (
 SELECT author_id FROM public.forum_threads WHERE id=$1 UNION SELECT author_id FROM public.forum_replies WHERE thread_id=$1
 ) ORDER BY id FOR NO KEY UPDATE`, thread)
		if e != nil {
			return nil, e
		}
		for rows.Next() {
		}
		e = rows.Err()
		rows.Close()
		if e != nil {
			return nil, e
		}
		if kind == "thread" {
			if _, e = tx.Exec(ctx, `DELETE FROM public.forum_likes WHERE (target_type='thread' AND target_id=$1) OR (target_type='reply' AND target_id IN(SELECT id FROM public.forum_replies WHERE thread_id=$1))`, id); e != nil {
				return nil, e
			}
			_, e = tx.Exec(ctx, "DELETE FROM public.forum_threads WHERE id=$1", id)
		} else {
			if _, e = tx.Exec(ctx, `WITH RECURSIVE subtree AS(SELECT id FROM public.forum_replies WHERE id=$1 UNION SELECT r.id FROM public.forum_replies r JOIN subtree s ON r.parent_reply_id=s.id)
 DELETE FROM public.forum_likes WHERE target_type='reply' AND target_id IN(SELECT id FROM subtree)`, id); e != nil {
				return nil, e
			}
			_, e = tx.Exec(ctx, "DELETE FROM public.forum_replies WHERE id=$1", id)
		}
		return application.OK, e
	})
}
func (s *Service) Report(ctx context.Context, user string, in Report) (json.RawMessage, error) {
	valid := false
	for _, r := range []string{"Spam", "Hate speech", "Misinformation", "Harassment", "Off-topic", "Other"} {
		valid = valid || r == in.Reason
	}
	if !valid || !application.ID(in.ID) || (in.Type != "thread" && in.Type != "reply") {
		return nil, application.ErrInvalid
	}
	if in.Reason == "Other" {
		if in.Custom == nil || !application.Text(strings.TrimSpace(*in.Custom), 200) {
			return nil, application.ErrInvalid
		}
		v := strings.TrimSpace(*in.Custom)
		in.Custom = &v
	} else {
		in.Custom = nil
	}
	return s.Write(ctx, func(tx pgx.Tx) (json.RawMessage, error) {
		thread, e := targetThread(ctx, tx, in.Type, in.ID)
		if e != nil {
			return nil, e
		}
		if _, e = lockThread(ctx, tx, thread); e != nil {
			return nil, e
		}
		if in.Type == "reply" {
			if _, e = targetThread(ctx, tx, in.Type, in.ID); e != nil {
				return nil, e
			}
		}
		_, e = tx.Exec(ctx, "INSERT INTO public.forum_reports(reporter_id,target_type,target_id,reason,custom_reason) VALUES($1,$2,$3,$4,$5)", user, in.Type, in.ID, in.Reason, in.Custom)
		return application.OK, e
	})
}
