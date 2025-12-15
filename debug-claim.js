const text = "Let me repeat the claim number: zero one seven zero zero zero zero seven eight seven zero three. Is that correct?";

const wordMap = {
  'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
  'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
  'oh': '0'
};

// Apply the same transformations as the code
let cleanedText = text
  .replace(/then\s+six\s+zeros[—\-\s]*(?=0\s+0)/gi, '')
  .replace(/followed\s+by\s+six\s+zeros[—\-\s]*(?=0\s+0)/gi, '')
  .replace(/six\s+zeros[—\-\s]*(?=0\s+0)/gi, '')
  .replace(/seven\s+zeros[—\-\s]*(?=0\s+0)/gi, '')
  .replace(/then\s+six\s+zeros/gi, ' 0 0 0 0 0 0 ')
  .replace(/followed\s+by\s+six\s+zeros/gi, ' 0 0 0 0 0 0 ')
  .replace(/six\s+zeros/gi, ' 0 0 0 0 0 0 ')
  .replace(/seven\s+zeros/gi, ' 0 0 0 0 0 0 0 ')
  .replace(/five\s+zeros/gi, ' 0 0 0 0 0 ')
  .replace(/four\s+zeros/gi, ' 0 0 0 0 ')
  .replace(/three\s+zeros/gi, ' 0 0 0 ')
  .replace(/two\s+zeros/gi, ' 0 0 ')
  .replace(/(?:ends?\s+(?:with|in)\s+(?:a\s+)?|then\s+)(one|two|three|four|five|six|seven|eight|nine)/gi,
    (match, digit) => ' ' + wordMap[digit.toLowerCase()] + ' ')
  .replace(/([A-Z])\s+as\s+in\s+\w+/gi, ' $1 ');

cleanedText = cleanedText
  .replace(/^Thank\s+you\.?\s*/gi, '')
  .replace(/^I\s+heard:?\s*/gi, '')
  .replace(/\bIs\s+that\s+correct\??\s*/gi, '')
  .replace(/\bdid\s+I\s+get\s+that\s+right\??\s*/gi, '');

console.log('Cleaned text:', cleanedText);
console.log('');

const tokens = cleanedText.split(/[\s,—\-]+/);
console.log('Tokens:', tokens);
console.log('');

let result = '';
for (const token of tokens) {
  const lower = token.toLowerCase().trim();
  if (!lower) continue;

  // Skip common filler words
  if (['thank', 'you', 'heard', 'is', 'that', 'correct', 'i', 'the'].includes(lower)) {
    console.log(`  Skipping filler: "${lower}"`);
    continue;
  }

  // Check if it's a digit word
  if (wordMap[lower]) {
    result += wordMap[lower];
    console.log(`  Digit word: "${lower}" -> ${wordMap[lower]}`);
    continue;
  }

  // Check if it's already a digit
  if (/^\d+$/.test(lower)) {
    result += lower;
    console.log(`  Digit: "${lower}"`);
    continue;
  }

  console.log(`  Unrecognized: "${lower}"`);
}

console.log('');
console.log('Result:', result);
console.log('Expected: 017000078703');
