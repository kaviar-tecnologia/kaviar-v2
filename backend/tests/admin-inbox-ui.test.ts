import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('InstitutionalInboxPage mailbox UX', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../frontend-app/src/pages/admin/InstitutionalInboxPage.jsx'),
    'utf8',
  );

  it('exposes received, unread, read, archived and trash mailboxes in Portuguese', () => {
    expect(source).toContain("label: 'Recebidos'");
    expect(source).toContain("label: 'Não lidos'");
    expect(source).toContain("label: 'Lidos'");
    expect(source).toContain("label: 'Arquivados'");
    expect(source).toContain("label: 'Lixeira'");
  });

  it('uses dedicated trash lifecycle endpoints instead of ARCHIVED as delete', () => {
    expect(source).toContain('/trash');
    expect(source).toContain('/restore');
    expect(source).toContain("confirmation: 'EMPTY_TRASH'");
    expect(source).toContain('Excluir definitivamente');
  });

  it('marks NEW email as READ when details are opened and shows a compact preview', () => {
    expect(source).toContain("loaded?.status === 'NEW'");
    expect(source).toContain("{ status: 'READ' }");
    expect(source).toContain('item.preview || item.from_email');
    expect(source).toContain('formatListDate(item.received_at)');
  });

  it('does not render a no-attachment chip for every message', () => {
    expect(source).toContain('Number(item.attachment_count || 0) > 0');
  });

  it('supports custom folders without conflating them with archive or trash', () => {
    expect(source).toContain('Minhas pastas');
    expect(source).toContain('Nova pasta');
    expect(source).toContain('/api/admin/inbound-emails/folders');
    expect(source).toContain('/folder');
    expect(source).toContain('Mover para pasta');
    expect(source).toContain('Excluir pasta');
  });
});
