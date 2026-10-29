package forum

import (
	"context"
	"encoding/json"
	"github.com/GajapriyanV/SetPiece/backend/internal/application"
	"github.com/jackc/pgx/v5"
)

const authorJSON = `CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('id',p.id,'username',p.username,'name',p.name,'avatar_url',p.avatar_url) END`
const threadJSON = `jsonb_build_object('id',t.id,'title',t.title,'body',t.body,'flair',t.flair,'is_featured',t.is_featured,'is_closed',t.is_closed,'upvotes_count',t.upvotes_count,'reply_count',t.reply_count,'created_at',t.created_at,'closes_at',t.closes_at,'author',` + authorJSON + `)`
const replyJSON = `jsonb_build_object('id',r.id,'parent_reply_id',r.parent_reply_id,'body',r.body,'upvotes_count',r.upvotes_count,'is_mvp',r.is_mvp,'created_at',r.created_at,'author',` + authorJSON + `)`

func (s *Service) List(ctx context.Context, flair, sort string, page int) (json.RawMessage, error) {
	if page < 1 || page > 100000 || (sort != "" && sort != "newest" && sort != "top") || (flair != "" && !validFlair(flair)) {
		return nil, application.ErrInvalid
	}
	order := "t.is_featured DESC,t.created_at DESC,t.id DESC"
	if sort == "top" {
		order = "t.upvotes_count DESC,t.created_at DESC,t.id DESC"
	}
	return application.JSON(ctx, s.Pool, `WITH items AS (
 SELECT `+threadJSON+`-'body' AS item,row_number() OVER(ORDER BY `+order+`) position FROM public.forum_threads t
 LEFT JOIN public.profiles p ON p.id=t.author_id WHERE ($1::text='' OR t.flair=$1)
 ORDER BY `+order+` LIMIT 20 OFFSET $2)
 SELECT jsonb_build_object('threads',coalesce((SELECT jsonb_agg(item ORDER BY position) FROM items),'[]'::jsonb),
 'topThread',(SELECT `+threadJSON+`-'body' FROM public.forum_threads t LEFT JOIN public.profiles p ON p.id=t.author_id WHERE t.created_at>=clock_timestamp()-interval '7 days' ORDER BY t.upvotes_count DESC,t.created_at DESC,t.id DESC LIMIT 1),
 'total',(SELECT count(*) FROM public.forum_threads WHERE ($1='' OR flair=$1)),'page',$3::int,'limit',20)`, flair, (page-1)*20, page)
}

type replyNode struct {
	ID       string          `json:"id"`
	Parent   *string         `json:"parent_reply_id"`
	Body     string          `json:"body"`
	Upvotes  int             `json:"upvotes_count"`
	MVP      bool            `json:"is_mvp"`
	Created  json.RawMessage `json:"created_at"`
	Author   json.RawMessage `json:"author"`
	Liked    bool            `json:"user_liked"`
	Children []*replyNode    `json:"children"`
}

func (s *Service) Detail(ctx context.Context, user, id string, page int) (json.RawMessage, error) {
	if !application.ID(id) || page < 1 || page > 100000 {
		return nil, application.ErrInvalid
	}
	read := func(tx pgx.Tx) (json.RawMessage, error) {
		var uid any
		if user != "" {
			uid = user
		}
		thread, e := application.JSON(ctx, tx, `SELECT `+threadJSON+`||jsonb_build_object('user_liked',EXISTS(SELECT 1 FROM public.forum_likes WHERE user_id=$2::uuid AND target_type='thread' AND target_id=t.id))
 FROM public.forum_threads t LEFT JOIN public.profiles p ON p.id=t.author_id WHERE t.id=$1`, id, uid)
		if e != nil {
			return nil, e
		}
		rows, e := tx.Query(ctx, `SELECT `+replyJSON+`||jsonb_build_object('user_liked',EXISTS(SELECT 1 FROM public.forum_likes WHERE user_id=$2::uuid AND target_type='reply' AND target_id=r.id),'children','[]'::jsonb)
 FROM public.forum_replies r LEFT JOIN public.profiles p ON p.id=r.author_id WHERE r.thread_id=$1 ORDER BY r.created_at,r.id LIMIT 31 OFFSET $3`, id, uid, (page-1)*30)
		if e != nil {
			return nil, e
		}
		all := []*replyNode{}
		flat := []json.RawMessage{}
		for rows.Next() {
			var raw []byte
			if e = rows.Scan(&raw); e != nil {
				rows.Close()
				return nil, e
			}
			var r replyNode
			if e = json.Unmarshal(raw, &r); e != nil {
				rows.Close()
				return nil, e
			}
			all = append(all, &r)
			flat = append(flat, raw)
		}
		e = rows.Err()
		rows.Close()
		if e != nil {
			return nil, e
		}
		var next any
		if len(all) > 30 {
			all = all[:30]
			flat = flat[:30]
			next = page + 1
		}
		byID := map[string]*replyNode{}
		for _, r := range all {
			byID[r.ID] = r
		}
		roots := []*replyNode{}
		for _, r := range all {
			parent := (*replyNode)(nil)
			if r.Parent != nil {
				parent = byID[*r.Parent]
			}
			safe := true
			steps := 0
			for p := parent; p != nil; {
				steps++
				if p.ID == r.ID || steps >= 20 {
					safe = false
					break
				}
				if p.Parent == nil {
					break
				}
				p = byID[*p.Parent]
			}
			if parent != nil && safe {
				parent.Children = append(parent.Children, r)
			} else {
				roots = append(roots, r)
			}
		}
		return json.Marshal(map[string]any{"thread": thread, "replies": roots, "replyRows": flat, "replyPage": page, "nextReplyPage": next, "current_user_id": uid})
	}
	if s.Writable {
		return s.Write(ctx, func(tx pgx.Tx) (json.RawMessage, error) {
			if _, e := lockThread(ctx, tx, id); e != nil {
				return nil, e
			}
			if e := closeExpired(ctx, tx, id); e != nil {
				return nil, e
			}
			return read(tx)
		})
	}
	tx, e := s.Pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if e != nil {
		return nil, e
	}
	defer tx.Rollback(ctx)
	out, e := read(tx)
	if e != nil {
		return nil, e
	}
	if e = tx.Commit(ctx); e != nil {
		return nil, e
	}
	return out, nil
}
func (s *Service) Reports(ctx context.Context, user, filter string) (json.RawMessage, error) {
	if filter != "" && filter != "all" && filter != "unreviewed" {
		return nil, application.ErrInvalid
	}
	if filter == "" {
		filter = "unreviewed"
	}
	if e := application.Admin(ctx, s.Pool, user); e != nil {
		return nil, e
	}
	return application.JSON(ctx, s.Pool, `WITH reports AS (
 SELECT jsonb_build_object('id',r.id,'target_type',r.target_type,'target_id',r.target_id,'reason',r.reason,'custom_reason',r.custom_reason,'is_reviewed',r.is_reviewed,'created_at',r.created_at,
 'reporter',CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('username',p.username,'avatar_url',p.avatar_url) END,
 'thread_id',CASE WHEN r.target_type='reply' THEN child.thread_id ELSE NULL END) item,r.created_at,r.id
 FROM public.forum_reports r LEFT JOIN public.profiles p ON p.id=r.reporter_id LEFT JOIN public.forum_replies child ON child.id=r.target_id AND r.target_type='reply'
 WHERE ($1='all' OR r.is_reviewed=false) ORDER BY r.created_at DESC,r.id DESC LIMIT 100)
 SELECT jsonb_build_object('reports',coalesce((SELECT jsonb_agg(item ORDER BY created_at DESC,id DESC) FROM reports),'[]'::jsonb),'total',(SELECT count(*) FROM public.forum_reports WHERE ($1='all' OR is_reviewed=false)))`, filter)
}
func (s *Service) Review(ctx context.Context, user, id string) (json.RawMessage, error) {
	if !application.ID(id) {
		return nil, application.ErrInvalid
	}
	return s.Write(ctx, func(tx pgx.Tx) (json.RawMessage, error) {
		if e := application.Admin(ctx, tx, user); e != nil {
			return nil, e
		}
		tag, e := tx.Exec(ctx, "UPDATE public.forum_reports SET is_reviewed=true WHERE id=$1", id)
		if e != nil {
			return nil, e
		}
		if tag.RowsAffected() == 0 {
			return nil, application.ErrNotFound
		}
		return application.OK, nil
	})
}
