// Selection utilities for parsing ranges and lists

/**
 * Parse a range string like "1-10" into an array of numbers
 * @param {string} rangeStr - Range string (e.g., "1-10")
 * @returns {number[]} Array of numbers in the range
 */
export function parseRange(rangeStr) {
  const parts = rangeStr.trim().split('-');
  if (parts.length !== 2) return [];
  
  const start = parseInt(parts[0].trim(), 10);
  const end = parseInt(parts[1].trim(), 10);
  
  if (isNaN(start) || isNaN(end) || start > end) return [];
  
  const result = [];
  for (let i = start; i <= end; i++) {
    result.push(i);
  }
  return result;
}

/**
 * Parse a list string like "1,2,3,5-10" into an array of numbers
 * @param {string} listStr - List string (e.g., "1,2,3,5-10")
 * @returns {number[]} Array of numbers
 */
export function parseList(listStr) {
  if (!listStr || !listStr.trim()) return [];
  
  const parts = listStr.split(',');
  const result = [];
  
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    
    if (trimmed.includes('-')) {
      // It's a range
      const rangeNums = parseRange(trimmed);
      result.push(...rangeNums);
    } else {
      // It's a single number
      const num = parseInt(trimmed, 10);
      if (!isNaN(num)) {
        result.push(num);
      }
    }
  }
  
  return [...new Set(result)]; // Remove duplicates
}

/**
 * Find plots by number strings (handles both numeric and string plot numbers)
 * @param {string[]} plotNums - Array of plot number strings
 * @param {Array} plots - Array of plot objects
 * @returns {Array} Array of matching plot objects
 */
export function findPlotsByNumbers(plotNums, plots) {
  const plotNumSet = new Set(plotNums.map(n => String(n).trim().toUpperCase()));
  return plots.filter(plot => {
    const plotNum = String(plot.n || '').trim().toUpperCase();
    return plotNumSet.has(plotNum);
  });
}

/**
 * Parse plot numbers from a string (can be ranges, lists, or individual numbers)
 * @param {string} input - Input string (e.g., "1,2,3", "1-10", "1,2,5-10")
 * @returns {string[]} Array of plot number strings
 */
export function parsePlotNumbers(input) {
  if (!input || !input.trim()) return [];
  
  const parts = input.split(',');
  const result = [];
  
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    
    if (trimmed.includes('-')) {
      // It's a range - need to handle both numeric and alphanumeric
      const rangeParts = trimmed.split('-');
      if (rangeParts.length === 2) {
        const start = rangeParts[0].trim();
        const end = rangeParts[1].trim();
        
        // Check if it's numeric range
        const startNum = parseInt(start, 10);
        const endNum = parseInt(end, 10);
        
        if (!isNaN(startNum) && !isNaN(endNum)) {
          // Numeric range
          for (let i = startNum; i <= endNum; i++) {
            result.push(String(i));
          }
        } else {
          // Alphanumeric - just add start and end
          result.push(start, end);
        }
      }
    } else {
      // Single plot number
      result.push(trimmed);
    }
  }
  
  return [...new Set(result)]; // Remove duplicates
}

