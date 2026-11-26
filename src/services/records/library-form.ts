import { missingRequired } from '../form-required.ts';

function coverFiles(fileId: string, title: string) {
  return fileId ? [{ id: fileId, fileName: title + ' 封面' }] : [];
}

export function libraryDraft(detail = {}) {
  const form = {
    title: '', type: 1, status: 'not_started', url: '', fileId: '', coverImgUrl: '',
    totalProgress: 0, currentProgress: 0, startDate: null, finishDate: null, remark: '',
    ...detail,
  };
  return { ...form, files: coverFiles(form.fileId, form.title) };
}

export function applyLibraryParse(form: any, result: any) {
  const fileId = form.fileId || result.fileId || '';
  Object.assign(form, result, {
    id: form.id,
    coverImgUrl: result.coverImgUrl || '',
    fileId,
    files: coverFiles(fileId, result.title || form.title),
  });
}

export function setLibraryCover(form: any, files: any[]) {
  form.files = files.slice(-1);
  form.fileId = form.files.at(-1)?.id || '';
  form.coverImgUrl = '';
}

export function libraryPayload(form: any, movie = false) {
  if (missingRequired('library', form)) {
    const titleLabel = movie ? '名称' : form.type === 2 ? '标题' : '书名';
    throw new Error('请输入' + titleLabel);
  }
  const { files, coverImgUrl, ...payload } = form;
  if (!movie) delete payload.type;
  payload.title = form.title.trim();
  payload.fileId = files.at(-1)?.id || null;
  for (const key of ['totalProgress', 'currentProgress']) {
    const value = Number(payload[key] || 0);
    if (!Number.isInteger(value) || value < 0) throw new Error('进度必须为非负整数');
    payload[key] = value;
  }
  if (payload.startDate && payload.finishDate && payload.finishDate < payload.startDate) {
    throw new Error('完成日期不能早于开始日期');
  }
  if (movie && payload.rating != null && payload.rating !== '') {
    const rating = Number(payload.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error('评分必须为1至5');
    payload.rating = rating;
  }
  return payload;
}
