const actions = {
  'membership.joined': 'เข้าร่วมกลุ่ม',
  'membership.updated': 'เปลี่ยนสิทธิ์หรือสถานะสมาชิก',
  'membership.left': 'ออกจากกลุ่ม',
  'membership.removed': 'นำสมาชิกออกจากกลุ่ม',
  'group.created': 'สร้างปฏิทิน',
  'group.updated': 'แก้ไขปฏิทิน',
  'group.settings-updated': 'เปลี่ยนการตั้งค่าปฏิทิน',
  'group.trashed': 'ย้ายปฏิทินเข้าถังขยะ',
  'group.restored': 'กู้คืนปฏิทิน',
  'group.purged': 'ลบปฏิทินถาวร',
  'group.transfer-requested': 'ขอโอนเจ้าของ',
  'group.transfer-declined': 'ปฏิเสธการโอนเจ้าของ',
  'group.owner-transferred': 'รับโอนเจ้าของ',
  'event.created': 'สร้างกิจกรรม',
  'event.updated': 'แก้ไขกิจกรรม',
  'event.deleted': 'ย้ายกิจกรรมเข้าถังขยะ',
  'event.reviewed': 'ตรวจอนุมัติกิจกรรม',
  'event.cancel': 'ยกเลิกกิจกรรม',
  'event.restore': 'กู้คืนกิจกรรม',
  'event.copy': 'ทำสำเนากิจกรรม',
  'event.trash': 'ย้ายกิจกรรมเข้าถังขยะ',
  'event.submit': 'ส่งกิจกรรมให้ตรวจอนุมัติ',
  'event.cancelOccurrence': 'ยกเลิกกิจกรรมเฉพาะครั้ง',
  'event.editOccurrence': 'แก้ไขกิจกรรมเฉพาะครั้ง',
  'invitation.created': 'สร้างคำเชิญ',
  'invitation.accepted': 'รับคำเชิญ',
  'invitation.resent': 'ส่งคำเชิญอีกครั้ง',
  'invitation.revoked': 'ยกเลิกคำเชิญ',
  'discord.binding-saved': 'ตั้งค่าช่องแจ้งเตือน Discord',
  'discord.binding-disabled': 'ปิดช่องแจ้งเตือน Discord',
  'discord.test-queued': 'ขอทดสอบแจ้งเตือน Discord',
  'platform.group-updated': 'ผู้ดูแลระบบแก้ไขปฏิทิน',
  'platform.membership-updated': 'ผู้ดูแลระบบเปลี่ยนสิทธิ์สมาชิก',
  'platform.owner-transferred': 'ผู้ดูแลระบบโอนเจ้าของ',
  'platform.job-retried': 'ผู้ดูแลระบบลองส่งแจ้งเตือนใหม่',
  'platform.event-updated': 'ผู้ดูแลระบบแก้ไขกิจกรรม',
  'platform.event-deleted': 'ผู้ดูแลระบบลบกิจกรรม',
  'platform.event-reviewed': 'ผู้ดูแลระบบตรวจอนุมัติกิจกรรม',
};

export const groupDate = (value) =>
  new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'long',
    timeStyle: 'medium',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value));

/** Read-only history: public labels and names, never invitation tokens or email addresses. */
export async function renderGroupHistory({ api, state, element, root }) {
  const groupId = state.groupId;
  let page = 1;
  root.replaceChildren(element('p', 'empty', 'กำลังโหลดประวัติ…'));

  async function load() {
    const result = await api(`/api/group/audit?page=${page}`, { groupId });

    if (state.groupId !== groupId || !root.isConnected) {
      return;
    }

    root.replaceChildren();
    const list = element('ol', 'history-timeline');

    for (const item of result.items) {
      const row = element('li', 'history-item');
      const heading = element('p', 'history-heading');
      heading.append(
        element('strong', '', item.actor_name),
        document.createTextNode(` · ${actions[item.action] || 'อัปเดตข้อมูลกลุ่ม'}`),
      );
      row.append(heading);

      if (item.target_name) {
        row.append(element('p', 'history-target', item.target_name));
      }

      const time = element('time', 'fine', groupDate(item.created_at));
      time.dateTime = item.created_at;
      row.append(time);
      list.append(row);
    }

    root.append(list);

    if (!result.items.length) {
      root.append(element('p', 'empty', 'ยังไม่มีประวัติในกลุ่มนี้'));
    }

    const controls = element('div', 'history-pagination');

    for (const [label, delta, disabled] of [
      ['ก่อนหน้า', -1, page === 1],
      ['ถัดไป', 1, !result.hasMore],
    ]) {
      const button = element('button', '', label);
      button.type = 'button';
      button.disabled = disabled;

      button.onclick = async () => {
        button.disabled = true;
        page += delta;

        try {
          await load();
        } catch (error) {
          page -= delta;
          button.disabled = false;
          root.append(element('p', 'notice', error.message));
        }
      };

      controls.append(button);
    }

    controls.insertBefore(element('span', 'fine', `หน้า ${page}`), controls.lastChild);
    root.append(controls);
  }

  await load();
}
