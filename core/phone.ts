export type PhoneResult = { ok: true; phone: string } | { ok: false; reason: string };

const BRAZIL_CODE = '55';

const BRAZIL_AREA_CODES = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43,
  44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77,
  79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

const ALLOWED_CHARS = /^[\d\s().+-]+$/;

const fail = (reason: string): PhoneResult => ({ ok: false, reason });

/**
 * Normalizes a phone number to digits-only international format (e.g. 5511999999999).
 * Numbers without "+" are treated as Brazilian. Syntactic validation only:
 * it does not mean the number has a WhatsApp account.
 */
export function normalizePhone(raw: string): PhoneResult {
  const trimmed = raw.trim();
  if (!trimmed) return fail('Telefone vazio');
  if (!ALLOWED_CHARS.test(trimmed)) return fail('Telefone contém caracteres inválidos');

  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return fail('Telefone sem dígitos');

  if (trimmed.startsWith('+')) return normalizeInternational(digits);
  if (digits.startsWith('00')) return normalizeInternational(digits.slice(2));
  return normalizeNational(digits.replace(/^0+/, ''));
}

function normalizeInternational(digits: string): PhoneResult {
  if (digits.startsWith(BRAZIL_CODE)) return validateBrazilian(digits.slice(BRAZIL_CODE.length));
  if (digits.length < 8 || digits.length > 15 || digits.startsWith('0')) {
    return fail('Número internacional com tamanho inválido');
  }
  return { ok: true, phone: digits };
}

function normalizeNational(digits: string): PhoneResult {
  if (digits.length === 10 || digits.length === 11) return validateBrazilian(digits);
  const hasCountryCode = digits.startsWith(BRAZIL_CODE) && (digits.length === 12 || digits.length === 13);
  if (hasCountryCode) return validateBrazilian(digits.slice(BRAZIL_CODE.length));
  return fail('Formato não reconhecido: use DDD + número ou o formato internacional com +');
}

function validateBrazilian(national: string): PhoneResult {
  if (national.length !== 10 && national.length !== 11) {
    return fail('Número brasileiro deve ter DDD + 8 ou 9 dígitos');
  }
  const areaCode = Number(national.slice(0, 2));
  if (!BRAZIL_AREA_CODES.has(areaCode)) return fail(`DDD ${national.slice(0, 2)} inexistente`);

  const subscriber = national.slice(2);
  const subscriberError = validateSubscriber(subscriber);
  if (subscriberError) return fail(subscriberError);

  return { ok: true, phone: BRAZIL_CODE + national };
}

function validateSubscriber(subscriber: string): string | null {
  if (subscriber.length === 9) {
    return subscriber.startsWith('9') ? null : 'Celular com 9 dígitos deve começar com 9';
  }
  if (/^[2-5]/.test(subscriber)) return null;
  return 'Celular sem o nono dígito (adicione o 9 após o DDD)';
}

export function formatPhone(phone: string): string {
  const isBrazilian = phone.startsWith(BRAZIL_CODE) && (phone.length === 12 || phone.length === 13);
  if (!isBrazilian) return `+${phone}`;
  const area = phone.slice(2, 4);
  const subscriber = phone.slice(4);
  const split = subscriber.length - 4;
  return `+55 (${area}) ${subscriber.slice(0, split)}-${subscriber.slice(split)}`;
}
