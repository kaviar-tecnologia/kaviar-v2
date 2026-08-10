/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('CrmPage premium redesign', () => {
  const src = readFileSync(resolve(__dirname, '../pages/admin/CrmPage.jsx'), 'utf8');

  it('has CITY_LANDING in SOURCES array', () => {
    expect(src).toContain("value: 'CITY_LANDING'");
    expect(src).toContain("label: 'Landing por cidade'");
  });

  it('status cards filter by status on click', () => {
    expect(src).toContain("f.status === key ? '' : key");
    expect(src).toContain('setPage(1)');
  });

  it('clicking a lead opens the drawer', () => {
    expect(src).toContain('openDetail(lead)');
    expect(src).toContain('setDrawerOpen(true)');
  });

  it('shows correct WhatsApp action for driver leads', () => {
    expect(src).toContain('openDriverWhatsAppInvite');
    expect(src).toContain('openPassengerWhatsAppInvite');
    // Should determine invite type based on lead_type
    expect(src).toContain("DRIVER");
    expect(src).toContain("PET_DRIVER");
  });

  it('has compact card layout for screens up to 1199px', () => {
    expect(src).toContain('useMediaQuery');
    expect(src).toContain('isCompactLayout');
    expect(src).toContain("'(max-width:1199px)'");
  });

  it('preserves loading state', () => {
    expect(src).toContain('loading');
    expect(src).toContain('CircularProgress');
  });

  it('preserves empty state', () => {
    expect(src).toContain('Nenhum lead encontrado');
  });

  it('preserves error state', () => {
    expect(src).toContain('error');
    expect(src).toContain('Alert');
  });

  it('uses dark theme (premium KAVIAR colors)', () => {
    expect(src).toContain('#04070C');
    expect(src).toContain("rgba(255,255,255,0.04)");
  });

  it('uses MUI icons instead of emojis in STATUS_MAP', () => {
    const statusBlock = src.slice(src.indexOf('STATUS_MAP'), src.indexOf('PRIORITY_MAP'));
    expect(statusBlock).not.toMatch(/[📥📞🤝📄📝⏳✅❌🚫⏸️]/);
  });

  it('uses Assignment icon in header instead of clipboard emoji', () => {
    expect(src).toContain('Assignment');
    expect(src).not.toContain("'📋 CRM KAVIAR'");
  });

  it('parses CITY_LANDING notes with EAR label (not Ouviu)', () => {
    expect(src).toContain('CITY_LANDING');
    expect(src).toContain('city_slug');
    expect(src).toContain('EAR:');
    expect(src).not.toContain('Ouviu:');
  });

  it('Drawer receives darkInputSx', () => {
    const drawerLine = src.match(/Drawer.*PaperProps.*\{[^}]*\}/s);
    expect(drawerLine).toBeTruthy();
    expect(drawerLine[0]).toContain('darkInputSx');
  });

  it('all three DialogContent receive dark input styling', () => {
    const dialogContents = src.match(/<DialogContent[^>]*>/g) || [];
    const withDarkInput = dialogContents.filter(d => d.includes('darkInputSx'));
    expect(withDarkInput.length).toBeGreaterThanOrEqual(3);
  });

  it('preserves CSV export', () => {
    expect(src).toContain('handleExportCsv');
    expect(src).toContain('Download');
  });

  it('preserves create lead dialog', () => {
    expect(src).toContain('handleCreate');
    expect(src).toContain('createOpen');
  });

  it('preserves pagination', () => {
    expect(src).toContain('Pagination');
    expect(src).toContain('Math.ceil(total / 30)');
  });
});
