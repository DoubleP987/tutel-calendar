export const categories = [
  ['academic', 'การศึกษา'],
  ['community', 'กิจกรรม / ชุมชน'],
  ['important', 'วันสำคัญ'],
  ['holiday', 'วันหยุด'],
  ['public', 'วันหยุดราชการ'],
  ['substitute', 'วันหยุดชดเชย'],
  ['bank', 'วันหยุดธนาคาร'],
  ['buddhist', 'วันสำคัญทางพุทธศาสนา'],
  ['holy', 'วันพระ'],
  ['royal', 'วันสำคัญสถาบันพระมหากษัตริย์'],
  ['festival', 'เทศกาลและประเพณี'],
  ['thai', 'วันสำคัญไทย'],
  ['international', 'วันสำคัญสากล'],
  ['islamic', 'ปฏิทินมุสลิม'],
].map(([id, label]) => ({ id, label }));
export const defaultCategories = ['academic', 'community', 'important', 'holiday'];
export const defaultPreferences = {
  categories: defaultCategories,
  notifyCategories: defaultCategories,
  notifyPublished: true,
  notifyReview: true,
  notifyReminders: true,
  leadMinutes: 15,
  dayTime: '07:00',
};
