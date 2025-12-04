// Debug the dash pattern extraction

const wordMap = {
  'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
  'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
  'oh': '0', 'o': '0'
};

const text = 'the claim number is four one zero eight nine six two dash one. Is that correct?';

let result = '';
let cleanedText = text;

// Handle word-form numbers in sequence
const numberWords = 'zero|one|two|three|four|five|six|seven|eight|nine|oh';
const wordSequencePattern = new RegExp(`((?:${numberWords})(?:[\\s,]+(?:${numberWords}))+)`, 'gi');
let wordMatch;
while ((wordMatch = wordSequencePattern.exec(cleanedText)) !== null) {
  console.log('Word sequence match:', wordMatch[0]);
  const words = wordMatch[0].toLowerCase().split(/[\s,]+/);
  for (const word of words) {
    const trimmed = word.trim();
    if (wordMap[trimmed]) {
      result += wordMap[trimmed];
    }
  }
}

console.log('After word sequence:', result);

// Handle dash X at end
const dashEndPattern = /dash\s+(\d|one|two|three|four|five|six|seven|eight|nine)/gi;
let dashEndMatch;
while ((dashEndMatch = dashEndPattern.exec(cleanedText)) !== null) {
  console.log('Dash end match:', dashEndMatch[0]);
  const val = dashEndMatch[1].toLowerCase();
  result += wordMap[val] || val;
}

console.log('Final result:', result);
console.log('Expected: 41089621');
