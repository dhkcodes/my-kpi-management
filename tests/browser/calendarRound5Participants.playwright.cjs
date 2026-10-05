const assert = require('assert/strict');
const { chromium } = require('/home/opc/tmp/calendar-pw/node_modules/playwright');
const fs = require('fs');

const BASE = 'http://127.0.0.1:8124';
const OUT = 'docs/calendar-round5-evidence/fixture-r3-r4-20261005-engineering-run.json';

const sortedMutations = (mutations) => [...mutations].sort((left, right) =>
  `${left.method} ${left.path} ${JSON.stringify(left.body)}`.localeCompare(`${right.method} ${right.path} ${JSON.stringify(right.body)}`));

const eventUpdateBody = (versionNo) => ({
  accountId: null,
  workloadId: null,
  opportunityDealId: null,
  opportunityId: null,
  relatedItemType: null,
  relatedItemId: null,
  relatedItemLabel: null,
  title: 'R5 FIXTURE',
  description: null,
  location: null,
  startsAt: '2026-10-20T11:00:00+09:00',
  endsAt: '2026-10-20T12:00:00+09:00',
  allDay: false,
  timeUnknown: false,
  forcePrivate: false,
  vacation: false,
  recurrence: 'NONE',
  recurrenceUntil: null,
  workingDays: 1,
  timezone: 'Asia/Seoul',
  visibility: 'DETAILS',
  versionNo,
});

const sharePut = (userKey) => ({
  method: 'PUT',
  path: `/api/v1/calendar/events/4201/shares/${userKey}`,
  body: { userKey, access: 'VIEW', visibility: 'DETAILS' },
});

(async () => {
  const result = {
    task: 'Calendar Round 5 requirements 3 and 4',
    fixtureOnly: true,
    aclLimitation: 'The fixture verifies browser/API synchronization only; it is not real two-account ACL verification.',
    startedAt: new Date().toISOString(),
    checks: [],
    participantClicks: [],
  };
  let browser;
  let page;
  let activeStage = 'browser launch';
  let failureCategory = 'locator';
  const check = (name, evidence = {}) => result.checks.push({ name, ok: true, ...evidence });
  const state = async () => (await (await page.request.get(`${BASE}/_test/state`)).json());
  const waitForMutationCount = async (count) => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const current = await state();
      if (current.mutations.length === count) return current;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    failureCategory = 'product event delivery';
    throw new Error(`expected ${count} mutations before timeout`);
  };

  try {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Seoul' });
    await page.request.post(`${BASE}/_test/reset`);

    activeStage = 'first real double-click';
    await page.goto(`${BASE}/calendar`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Calendar' }).waitFor();
    await page.getByRole('gridcell', { name: /^2026-10-20/ }).dblclick({ position: { x: 12, y: 12 } });
    await page.getByRole('dialog', { name: '2026-10-20' }).waitFor();
    assert.equal(await page.locator('.calendar-day-hour time').first().innerText(), '09:00');
    assert.equal(await page.locator('.calendar-day-hour time').last().innerText(), '18:00');
    check('first legitimate browser double-click opens the 09:00–18:00 day timeline');

    activeStage = 'selection switching and blank clear';
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Calendar' }).waitFor();
    const first = page.locator('.calendar-event').filter({ hasText: 'R5 FIXTURE' }).first();
    const second = page.locator('.calendar-event').filter({ hasText: 'R5 SECOND' }).first();
    await first.click();
    assert.equal(await first.evaluate((element) => element.classList.contains('is-selected')), true);
    assert.equal(await page.locator('.calendar-event.is-selected').count(), 1);
    assert.equal(await page.locator('.calendar-event-actions').count(), 1);
    await second.click();
    assert.equal(await second.evaluate((element) => element.classList.contains('is-selected')), true);
    assert.equal(await page.locator('.calendar-event.is-selected').count(), 1);
    assert.equal(await page.locator('.calendar-event-actions').count(), 1);
    await page.getByRole('gridcell', { name: /^2026-10-21/ }).click({ position: { x: 12, y: 12 } });
    assert.equal(await page.locator('.calendar-event.is-selected').count(), 0);
    assert.equal(await page.locator('.calendar-event-actions').count(), 0);
    check('event A → event B → blank region leaves no selection or action state');

    activeStage = 'saved participant immediate mutations';
    await page.getByRole('gridcell', { name: /^2026-10-20/ }).dblclick({ position: { x: 12, y: 12 } });
    const dayDialog = page.getByRole('dialog', { name: '2026-10-20' });
    const timed = dayDialog.locator('.calendar-timeline-event').filter({ hasText: 'R5 FIXTURE' }).first();
    await timed.click();
    await timed.getByRole('button', { name: /^#(?:Share User,Second User|Second User,Share User)$/ }).click();
    const participantEditor = page.locator('.calendar-mention-editor[aria-label="Change participants"]');
    const shareUser = participantEditor.locator('input[type="checkbox"][aria-label="Share User"]');
    const secondUser = participantEditor.locator('input[type="checkbox"][aria-label="Second User"]');
    assert.equal(await shareUser.isChecked(), true);
    assert.equal(await secondUser.isChecked(), true);
    check('two persisted participants render as native checked checkboxes');

    const clickAndAssert = async ({ checkbox, expectedChecked, expectedUsers, expectedMutations, label }) => {
      const before = await state();
      await checkbox.click();
      const after = await waitForMutationCount(before.mutations.length + expectedMutations.length);
      assert.equal(await participantEditor.isVisible(), true, 'participant editor closed during its own pointer interaction');
      assert.equal(await shareUser.isChecked(), expectedUsers.includes('share-user'));
      assert.equal(await secondUser.isChecked(), expectedUsers.includes('second-user'));
      failureCategory = 'fixture handling';
      assert.deepEqual(sortedMutations(after.mutations.slice(before.mutations.length)), sortedMutations(expectedMutations));
      assert.deepEqual((after.eventShares['4201'] || []).map((share) => share.userKey).sort(), [...expectedUsers].sort());
      result.participantClicks.push({
        label,
        uiChecked: { shareUser: await shareUser.isChecked(), secondUser: await secondUser.isChecked() },
        mutations: after.mutations.slice(before.mutations.length),
        fixturePersistedUserKeys: (after.eventShares['4201'] || []).map((share) => share.userKey),
      });
      assert.equal(await checkbox.isChecked(), expectedChecked);
      failureCategory = 'product event delivery';
    };

    await clickAndAssert({
      checkbox: shareUser,
      expectedChecked: false,
      expectedUsers: ['second-user'],
      expectedMutations: [
        { method: 'PUT', path: '/api/v1/calendar/events/4201', body: eventUpdateBody(1) },
        { method: 'DELETE', path: '/api/v1/calendar/events/4201/shares/share-user', body: null },
        sharePut('second-user'),
      ],
      label: 'deselect Share User',
    });
    await clickAndAssert({
      checkbox: shareUser,
      expectedChecked: true,
      expectedUsers: ['share-user', 'second-user'],
      expectedMutations: [
        { method: 'PUT', path: '/api/v1/calendar/events/4201', body: eventUpdateBody(2) },
        sharePut('share-user'),
        sharePut('second-user'),
      ],
      label: 'reselect Share User',
    });
    await clickAndAssert({
      checkbox: secondUser,
      expectedChecked: false,
      expectedUsers: ['share-user'],
      expectedMutations: [
        { method: 'PUT', path: '/api/v1/calendar/events/4201', body: eventUpdateBody(3) },
        { method: 'DELETE', path: '/api/v1/calendar/events/4201/shares/second-user', body: null },
        sharePut('share-user'),
      ],
      label: 'deselect Second User',
    });
    check('every saved-event click immediately matches UI, exact request payloads, and fixture persistence');

    activeStage = 'reload persisted participant state';
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('gridcell', { name: /^2026-10-20/ }).dblclick({ position: { x: 12, y: 12 } });
    const reloadedDayDialog = page.getByRole('dialog', { name: '2026-10-20' });
    await reloadedDayDialog.waitFor();
    assert.deepEqual(await reloadedDayDialog.locator('.calendar-day-hour time').allTextContents(), ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00']);
    const reloadedEvent = reloadedDayDialog.locator('.calendar-timeline-event').filter({ hasText: 'R5 FIXTURE' }).first();
    await reloadedEvent.click();
    await reloadedEvent.getByRole('button', { name: '#Share User', exact: true }).click();
    const reloadedParticipantEditor = page.locator('.calendar-mention-editor[aria-label="Change participants"]');
    assert.equal(await reloadedParticipantEditor.locator('input[type="checkbox"][aria-label="Share User"]').isChecked(), true);
    assert.equal(await reloadedParticipantEditor.locator('input[type="checkbox"][aria-label="Second User"]').isChecked(), false);
    check('reload, 09:00–18:00 reopen, and event reselection preserve participant state');

    activeStage = 'unsaved participant deferral';
    await reloadedParticipantEditor.locator('button[aria-label="Close"]').click();
    const beforeDraft = await state();
    const timeline = page.locator('.calendar-day-timeline--interactive');
    const bounds = await timeline.boundingBox();
    assert.ok(bounds, 'timeline has no browser bounding box');
    await timeline.dblclick({ position: { x: 90, y: Math.round(bounds.height * (7.5 / 9)) } });
    const title = page.getByRole('textbox', { name: 'Event title', exact: true });
    const beforeTyping = await state();
    const searchRequestsBefore = beforeTyping.requests.filter((request) => request.includes('/workload-options?') || request.includes('/directory/users?q=')).length;
    const typingStartedAt = Date.now();
    await title.pressSequentially('R5 UNSAVED', { delay: 15 });
    assert.equal(await title.inputValue(), 'R5 UNSAVED');
    assert.equal(await title.evaluate((element) => element === document.activeElement), true);
    assert.ok(Date.now() - typingStartedAt < 1500, 'general typing exceeded latency budget');
    await page.waitForTimeout(350);
    const afterGeneralTyping = await state();
    const searchRequestsAfter = afterGeneralTyping.requests.filter((request) => request.includes('/workload-options?') || request.includes('/directory/users?q=')).length;
    assert.equal(searchRequestsAfter, searchRequestsBefore);
    check('general typing stays focused, reflects within budget, and does not start relation search');
    await title.pressSequentially(' #Sh', { delay: 15 });
    await page.waitForTimeout(400);
    await page.getByRole('option', { name: 'Share User' }).click();
    await title.fill('R5 UNSAVED #Se');
    await page.getByRole('option', { name: 'Second User' }).click();
    assert.equal(await title.inputValue(), 'R5 UNSAVED');
    assert.match(await page.locator('.calendar-timeline-editor .calendar-event-relations').innerText(), /#(?:Share User,Second User|Second User,Share User)/);
    const beforeSave = await state();
    assert.equal(beforeSave.mutations.length, beforeDraft.mutations.length, 'unsaved participant selection emitted a mutation');
    check('unsaved draft participant selection emits zero mutations before Save');
    await title.focus();
    const keepScroll = await page.locator('.calendar-day-timeline-scroll').evaluate((element) => element.scrollTop);
    await page.evaluate(() => { window.__r5EditorIdentity = document.querySelector('[data-calendar-editor="block"]'); });
    await page.keyboard.press('Escape');
    const saveConfirm = page.getByRole('dialog', { name: 'Save changes?' });
    await saveConfirm.waitFor();
    assert.equal(await saveConfirm.getByRole('button', { name: 'Keep editing' }).isVisible(), true);
    assert.equal(await saveConfirm.getByRole('button', { name: 'Discard and close' }).isVisible(), true);
    assert.equal(await saveConfirm.getByRole('button', { name: 'Save and close' }).isVisible(), true);
    await saveConfirm.getByRole('button', { name: 'Keep editing' }).click();
    assert.equal(await page.evaluate(() => window.__r5EditorIdentity === document.querySelector('[data-calendar-editor="block"]')), true);
    assert.equal(await title.evaluate((element) => element === document.activeElement), true);
    assert.equal(await page.locator('.calendar-day-timeline-scroll').evaluate((element) => element.scrollTop), keepScroll);
    check('Keep editing preserves editor DOM identity, input focus, and timeline scroll without remount');

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const afterSave = await waitForMutationCount(beforeSave.mutations.length + 3);
    const draftMutations = afterSave.mutations.slice(beforeSave.mutations.length);
    const created = afterSave.events.find((event) => event.title === 'R5 UNSAVED');
    assert.ok(created, 'saved draft is missing from fixture events');
    assert.deepEqual((afterSave.eventShares[String(created.id)] || []).map((share) => share.userKey).sort(), ['second-user', 'share-user']);
    assert.deepEqual(sortedMutations(draftMutations), sortedMutations([
      { method: 'POST', path: '/api/v1/calendar/events', body: {
        accountId: null, workloadId: null, opportunityDealId: null, opportunityId: null,
        relatedItemType: null, relatedItemId: null, relatedItemLabel: null,
        title: 'R5 UNSAVED', description: null, location: null,
        startsAt: '2026-10-20T16:30:00+09:00', endsAt: '2026-10-20T17:30:00+09:00',
        allDay: false, timeUnknown: false, forcePrivate: false, vacation: false,
        recurrence: 'NONE', recurrenceUntil: null, workingDays: 1,
        timezone: 'Asia/Seoul', visibility: 'DETAILS',
      } },
      { method: 'PUT', path: `/api/v1/calendar/events/${created.id}/shares/share-user`, body: { userKey: 'share-user', access: 'VIEW', visibility: 'DETAILS' } },
      { method: 'PUT', path: `/api/v1/calendar/events/${created.id}/shares/second-user`, body: { userKey: 'second-user', access: 'VIEW', visibility: 'DETAILS' } },
    ]));
    result.unsavedDraft = { mutationsBeforeSave: 0, mutationsAfterSave: draftMutations, createdEventId: created.id, persistedUserKeys: afterSave.eventShares[String(created.id)].map((share) => share.userKey) };
    check('final Save creates the draft once and synchronizes exactly two participants');

    const layoutDialog = page.getByRole('dialog', { name: '2026-10-20' });
    const layoutEvent = layoutDialog.locator('.calendar-timeline-event').filter({ hasText: 'R5 FIXTURE' }).first();
    await layoutEvent.press('Enter');
    const actionGroup = layoutEvent.locator('.calendar-event-actions');
    const eventBox = await layoutEvent.boundingBox();
    const actionBox = await actionGroup.boundingBox();
    assert.ok(eventBox && actionBox);
    assert.ok(actionBox.x >= eventBox.x + eventBox.width / 2);
    assert.ok(actionBox.y <= eventBox.y + eventBox.height / 2);
    for (const label of ['Recurrence','Private','Time Off','Cancel Event','Delete']) assert.equal(await actionGroup.getByRole('button', { name: label }).isVisible(), true);
    check('selected event actions stay in the upper-right and use English labels');
    await page.setViewportSize({ width: 390, height: 600 });
    const fixedArea = layoutDialog.locator('.calendar-day-undated');
    const timelineScroller = layoutDialog.locator('.calendar-day-timeline-scroll');
    const fixedBefore = await fixedArea.boundingBox();
    const scrollTop = await timelineScroller.evaluate((element) => { element.scrollTop = element.scrollHeight; return element.scrollTop; });
    const fixedAfter = await fixedArea.boundingBox();
    assert.ok(scrollTop > 0);
    assert.ok(fixedBefore && fixedAfter);
    assert.equal(Math.round(fixedBefore.y), Math.round(fixedAfter.y));
    check('only the 09:00–18:00 timeline scrolls while the undated area stays fixed');

    await page.screenshot({ path: '/tmp/calendar-round5-r3-r4.png', fullPage: false });
    result.screenshot = '/tmp/calendar-round5-r3-r4.png';
    result.ok = true;
  } catch (error) {
    result.ok = false;
    result.failureCategory = failureCategory;
    result.failedStage = activeStage;
    result.error = String(error.stack || error);
    if (page) {
      result.debug = {
        url: page.url(),
        participantEditor: await page.locator('.calendar-mention-editor').innerHTML().catch(() => ''),
        body: (await page.locator('body').innerText().catch(() => '')).slice(0, 1600),
      };
    }
  } finally {
    result.completedAt = new Date().toISOString();
    fs.writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
    if (browser) await browser.close();
  }

  if (!result.ok) {
    console.error(result.error);
    process.exit(1);
  }
  console.log(JSON.stringify(result, null, 2));
})();
