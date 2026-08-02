import { Router } from 'express';
import * as store from '../store.js';
import * as services from '../services.js';
import { asyncH, vStr } from '../util.js';
import { requireAuth } from '../auth.js';

/** Invite-link joining (v1.4): POST /api/invites/:token/join */
export function invitesRouter(cfg, hub) {
  const r = Router();
  r.use(requireAuth(cfg));

  r.post('/:token/join', asyncH(async (req, res) => {
    const token = vStr(req.params.token, { label: 'Invite token', min: 4, max: 64 });
    const { chat, alreadyMember, systemMessage } = services.joinViaInvite(req.user, token, cfg.limits);
    if (!alreadyMember) {
      // Joiner gets the full chat first, then everyone learns about the join.
      services.emitChatToMembers(hub, chat.id, { type: 'chat:new', onlyUserIds: [req.user.id] });
      if (systemMessage) services.emitNewMessage(hub, chat.id, systemMessage);
      services.emitChatToMembers(hub, chat.id);
    }
    res.json({ chat: store.chatPayloadFor(chat.id, req.user.id), alreadyMember });
  }));

  return r;
}
