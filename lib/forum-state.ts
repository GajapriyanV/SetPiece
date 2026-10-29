export interface ReplyNode<T> { id: string; parent_reply_id: string | null; children: T[] }
export function mergeReplyPage<T extends ReplyNode<T>>(current: T[], incoming: T[]): T[] {
 const nodes=new Map<string,T>();
 const pending=[...current];
 while(pending.length){const row=pending.shift()!;if(nodes.has(row.id))continue;nodes.set(row.id,{...row,children:[]});pending.push(...row.children);}
 for(const row of incoming)nodes.set(row.id,{...row,children:[]});
 const roots:T[]=[];
 for(const row of nodes.values()){
  const parent=row.parent_reply_id?nodes.get(row.parent_reply_id):undefined;
  let safe=true,depth=0,ancestor=parent;
  while(ancestor){if(ancestor.id===row.id || ++depth>=20){safe=false;break;}ancestor=ancestor.parent_reply_id?nodes.get(ancestor.parent_reply_id):undefined;}
  if(parent&&safe)parent.children.push(row);else roots.push(row);
 }
 return roots;
}
