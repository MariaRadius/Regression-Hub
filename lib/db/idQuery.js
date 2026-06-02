import { ObjectId } from 'mongodb';

export function idCandidates(id) {
  const candidates = [id];
  if (ObjectId.isValid(id)) {
    candidates.push(new ObjectId(id));
  }
  return candidates;
}

export function idMatch(id) {
  return { $in: idCandidates(id) };
}

export function idsMatch(ids) {
  return { $in: ids.flatMap(idCandidates) };
}
