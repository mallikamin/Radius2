import React, { useEffect, useMemo, useState } from 'react';

const COUNTRY_OPTIONS = [
  { code: 'PK', label: 'Pakistan', dial: '+92' },
  { code: 'IN', label: 'India', dial: '+91' },
  { code: 'AE', label: 'UAE', dial: '+971' },
  { code: 'SA', label: 'Saudi Arabia', dial: '+966' },
  { code: 'GB', label: 'United Kingdom', dial: '+44' },
  { code: 'US', label: 'United States', dial: '+1' },
  { code: 'CA', label: 'Canada', dial: '+1' }
];

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function splitByChunks(digits, chunks) {
  const parts = [];
  let idx = 0;
  for (const size of chunks) {
    if (idx >= digits.length) break;
    parts.push(digits.slice(idx, idx + size));
    idx += size;
  }
  if (idx < digits.length) parts.push(digits.slice(idx));
  return parts.join(' ');
}

function formatLocalDigits(countryCode, digits) {
  if (!digits) return '';
  if (countryCode === 'PK') {
    let d = digits;
    if (d.startsWith('0')) d = d.slice(1);
    return splitByChunks(d, [3, 7]);
  }
  if (countryCode === 'US' || countryCode === 'CA') {
    return splitByChunks(digits, [3, 3, 4]);
  }
  return splitByChunks(digits, [3, 3, 4]);
}

function parseValue(value) {
  const raw = String(value || '').trim();
  if (!raw) return { country: COUNTRY_OPTIONS[0], localDigits: '' };

  const byDial = COUNTRY_OPTIONS.find((c) => raw.startsWith(c.dial));
  if (!byDial) {
    return { country: COUNTRY_OPTIONS[0], localDigits: onlyDigits(raw) };
  }

  const local = onlyDigits(raw.slice(byDial.dial.length));
  return { country: byDial, localDigits: local };
}

export default function PhoneInput({
  label = 'Mobile',
  value,
  onChange,
  required = false,
  placeholder = 'Enter mobile number'
}) {
  const parsed = useMemo(() => parseValue(value), [value]);
  const [country, setCountry] = useState(parsed.country);
  const [localDigits, setLocalDigits] = useState(parsed.localDigits);

  useEffect(() => {
    setCountry(parsed.country);
    setLocalDigits(parsed.localDigits);
  }, [parsed.country, parsed.localDigits]);

  const emitValue = (nextCountry, nextDigits) => {
    const formattedLocal = formatLocalDigits(nextCountry.code, nextDigits);
    const out = formattedLocal ? `${nextCountry.dial} ${formattedLocal}` : '';
    onChange(out.trim());
  };

  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}{required ? ' *' : ''}</label>
      <div className="flex gap-2">
        <select
          className="border rounded-lg px-3 py-2 text-sm bg-white min-w-[150px]"
          value={country.code}
          onChange={(e) => {
            const nextCountry = COUNTRY_OPTIONS.find((c) => c.code === e.target.value) || COUNTRY_OPTIONS[0];
            setCountry(nextCountry);
            emitValue(nextCountry, localDigits);
          }}
        >
          {COUNTRY_OPTIONS.map((c) => (
            <option key={`${c.code}-${c.dial}`} value={c.code}>
              {c.label} ({c.dial})
            </option>
          ))}
        </select>
        <input
          type="text"
          value={formatLocalDigits(country.code, localDigits)}
          onChange={(e) => {
            const digits = onlyDigits(e.target.value).slice(0, 15);
            setLocalDigits(digits);
            emitValue(country, digits);
          }}
          required={required}
          placeholder={placeholder}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>
    </div>
  );
}
