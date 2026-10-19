/**
 * The curated, staff-approvable exercise bank for the demo topic
 * (Python loops/lists). This is placeholder content pending actual sign-off
 * from the course organiser (see "Open items" in the plan) — structurally
 * complete, swap the prompts/tests once real INF1-IP exercises are agreed.
 *
 * Every variation "changes one thing that matters" (per InfSocrat 2.0's
 * own guidance) rather than a single-symbol swap a student could pattern-
 * match without understanding.
 */
import type { TestCase } from "./pyodideRunner.js";

export interface Variation {
  id: string;
  prompt: string;
  functionName: string;
  starterCode: string;
  tests: TestCase[];
  /** What this variation changes relative to the base exercise, and why it matters. */
  changesOneThing: string;
}

export interface Exercise {
  id: string;
  topic: string;
  prompt: string;
  functionName: string;
  starterCode: string;
  tests: TestCase[];
  /** Never shown to the student directly; used internally for the similarity guardrail. */
  referenceSolution: string;
  variations: Variation[];
  conceptLink: { title: string; note: string };
  /** H0/H1/H3 render from these templates — no API call. */
  hintTemplates: { H0: string; H1: string; H3: string };
}

export const exerciseBank: Exercise[] = [
  {
    id: "count-positives",
    topic: "loops-and-lists",
    prompt: "Write count_positives(nums) that returns how many numbers in the list are greater than zero.",
    functionName: "count_positives",
    starterCode: "def count_positives(nums):\n    # your code here\n    pass\n",
    referenceSolution:
      "def count_positives(nums):\n    count = 0\n    for n in nums:\n        if n > 0:\n            count += 1\n    return count\n",
    tests: [
      { description: "mixed list", input: [[1, -2, 3, -4, 5]], expected: 3 },
      { description: "all negative", input: [[-1, -2, -3]], expected: 0 },
      { description: "empty list", input: [[]], expected: 0 },
    ],
    conceptLink: {
      title: "Accumulator pattern (looping with a running total/count)",
      note: "A loop that starts a counter before the loop, and updates it once per matching item.",
    },
    hintTemplates: {
      H0: "Have another go — what should this function return for an empty list, and why?",
      H1: "This is an accumulator pattern: a counter that starts before the loop and updates once per matching item. See the lecture note on 'Accumulator pattern'.",
      H3: "Think about what value your counter starts at, and exactly which condition should make it go up by one each time through the loop.",
    },
    variations: [
      {
        id: "count-in-range",
        prompt: "Write count_in_range(nums, low, high) that counts numbers strictly between low and high.",
        functionName: "count_in_range",
        starterCode: "def count_in_range(nums, low, high):\n    # your code here\n    pass\n",
        tests: [
          { description: "typical range", input: [[1, 5, 10, 15, 20], 4, 16], expected: 3 },
          { description: "no matches", input: [[1, 2, 3], 10, 20], expected: 0 },
        ],
        changesOneThing: "Two conditions must both hold, not one — tests whether the student understands the condition, not just the loop shape.",
      },
      {
        id: "positives-in-nested",
        prompt: "Write count_positives_nested(lists) that counts positive numbers across a list of lists.",
        functionName: "count_positives_nested",
        starterCode: "def count_positives_nested(lists):\n    # your code here\n    pass\n",
        tests: [
          { description: "nested lists", input: [[[1, -2], [3, 4], [-5]]], expected: 3 },
          { description: "empty outer list", input: [[]], expected: 0 },
        ],
        changesOneThing: "A loop inside a loop — tests whether the accumulator pattern generalises, not just whether this one loop was memorised.",
      },
    ],
  },
  {
    id: "sum-list",
    topic: "loops-and-lists",
    prompt: "Write sum_list(nums) that returns the sum of all numbers in the list.",
    functionName: "sum_list",
    starterCode: "def sum_list(nums):\n    # your code here\n    pass\n",
    referenceSolution: "def sum_list(nums):\n    total = 0\n    for n in nums:\n        total += n\n    return total\n",
    tests: [
      { description: "typical list", input: [[1, 2, 3, 4]], expected: 10 },
      { description: "empty list", input: [[]], expected: 0 },
      { description: "negatives included", input: [[5, -2, 3]], expected: 6 },
    ],
    conceptLink: {
      title: "Accumulator pattern (running total)",
      note: "Same shape as count_positives, but the accumulator adds a value instead of adding one.",
    },
    hintTemplates: {
      H0: "What should the running total start at before you've looked at any numbers?",
      H1: "This is the same accumulator pattern as count_positives — but adding the number itself, not adding one.",
      H3: "Inside the loop, what single line updates `total` using the current item `n`?",
    },
    variations: [
      {
        id: "sum-evens",
        prompt: "Write sum_evens(nums) that sums only the even numbers.",
        functionName: "sum_evens",
        starterCode: "def sum_evens(nums):\n    # your code here\n    pass\n",
        tests: [
          { description: "mixed list", input: [[1, 2, 3, 4, 5, 6]], expected: 12 },
          { description: "no evens", input: [[1, 3, 5]], expected: 0 },
        ],
        changesOneThing: "Adds a filter condition before accumulating — tests whether the student can combine 'if' with the accumulator, not just repeat it.",
      },
      {
        id: "sum-nested",
        prompt: "Write sum_nested(lists) that sums all numbers across a list of lists.",
        functionName: "sum_nested",
        starterCode: "def sum_nested(lists):\n    # your code here\n    pass\n",
        tests: [
          { description: "nested lists", input: [[[1, 2], [3], [4, 5]]], expected: 15 },
          { description: "empty outer list", input: [[]], expected: 0 },
        ],
        changesOneThing: "A loop inside a loop, same as count_positives_nested — reinforces the generalisation across two different exercises (interleaving).",
      },
    ],
  },
  {
    id: "find-max",
    topic: "loops-and-lists",
    prompt: "Write find_max(nums) that returns the largest number in a non-empty list, without using the built-in max().",
    functionName: "find_max",
    starterCode: "def find_max(nums):\n    # your code here\n    pass\n",
    referenceSolution:
      "def find_max(nums):\n    best = nums[0]\n    for n in nums[1:]:\n        if n > best:\n            best = n\n    return best\n",
    tests: [
      { description: "typical list", input: [[3, 7, 2, 9, 4]], expected: 9 },
      { description: "single element", input: [[5]], expected: 5 },
      { description: "all equal", input: [[2, 2, 2]], expected: 2 },
    ],
    conceptLink: {
      title: "Tracking a running 'best so far'",
      note: "Instead of counting or summing, the accumulator holds the best candidate seen so far.",
    },
    hintTemplates: {
      H0: "What's a safe starting guess for the largest number, before you've looked at the rest of the list?",
      H1: "Try starting your 'best so far' as the first element, then compare every later element against it.",
      H3: "When should `best` be replaced with the current item — write that one condition out in words first.",
    },
    variations: [
      {
        id: "find-min",
        prompt: "Write find_min(nums) that returns the smallest number in a non-empty list.",
        functionName: "find_min",
        starterCode: "def find_min(nums):\n    # your code here\n    pass\n",
        tests: [
          { description: "typical list", input: [[3, 7, 2, 9, 4]], expected: 2 },
          { description: "single element", input: [[5]], expected: 5 },
        ],
        changesOneThing: "Flips the comparison direction — tests whether the student understands *why* the condition is '>', not just where to paste it.",
      },
      {
        id: "find-max-abs",
        prompt: "Write find_max_abs(nums) that returns the number with the largest absolute value (keeping its original sign).",
        functionName: "find_max_abs",
        starterCode: "def find_max_abs(nums):\n    # your code here\n    pass\n",
        tests: [
          { description: "negative wins", input: [[3, -7, 2]], expected: -7 },
          { description: "positive wins", input: [[3, -2, 5]], expected: 5 },
        ],
        changesOneThing: "Changes the basis of comparison (absolute value) while keeping the original value — tests whether the 'running best' idea transfers to a new comparison rule.",
      },
    ],
  },
  {
    id: "reverse-list",
    topic: "loops-and-lists",
    prompt: "Write reverse_list(nums) that returns a new list with the elements in reverse order, without using nums[::-1] or .reverse().",
    functionName: "reverse_list",
    starterCode: "def reverse_list(nums):\n    # your code here\n    pass\n",
    referenceSolution:
      "def reverse_list(nums):\n    result = []\n    for n in nums:\n        result = [n] + result\n    return result\n",
    tests: [
      { description: "typical list", input: [[1, 2, 3]], expected: [3, 2, 1] },
      { description: "empty list", input: [[]], expected: [] },
      { description: "single element", input: [[7]], expected: [7] },
    ],
    conceptLink: {
      title: "Building a new list by inserting at the front",
      note: "Instead of accumulating a number, the accumulator here is a list being built up.",
    },
    hintTemplates: {
      H0: "What should the result list start as, before you've placed anything in it?",
      H1: "Try building a brand-new list, and placing each item you see at the *front* of what you've built so far.",
      H3: "For each item `n`, how would you combine `[n]` with the list you've built so far so `n` ends up first?",
    },
    variations: [
      {
        id: "reverse-words",
        prompt: "Write reverse_words(sentence) that returns the words of a sentence in reverse order, as a list.",
        functionName: "reverse_words",
        starterCode: "def reverse_words(sentence):\n    # your code here\n    pass\n",
        tests: [
          { description: "typical sentence", input: ["the quick brown fox"], expected: ["fox", "brown", "quick", "the"] },
          { description: "single word", input: ["hello"], expected: ["hello"] },
        ],
        changesOneThing: "Different input domain (a string that must first become a list of words) — tests whether the 'build by inserting at the front' idea transfers beyond numbers.",
      },
      {
        id: "reverse-in-pairs",
        prompt: "Write reverse_in_pairs(nums) that reverses the order of consecutive pairs, e.g. [1,2,3,4] -> [2,1,4,3].",
        functionName: "reverse_in_pairs",
        starterCode: "def reverse_in_pairs(nums):\n    # your code here\n    pass\n",
        tests: [
          { description: "even length", input: [[1, 2, 3, 4]], expected: [2, 1, 4, 3] },
          { description: "odd length, last kept", input: [[1, 2, 3]], expected: [2, 1, 3] },
        ],
        changesOneThing: "Reverses in local groups of two rather than the whole list — tests whether the student can adapt the pattern to a different grouping rule, not just reuse it wholesale.",
      },
    ],
  },
  {
    id: "count-vowels",
    topic: "loops-and-lists",
    prompt: "Write count_vowels(word) that counts how many letters in the string are vowels (a, e, i, o, u), using a loop.",
    functionName: "count_vowels",
    starterCode: "def count_vowels(word):\n    # your code here\n    pass\n",
    referenceSolution:
      'def count_vowels(word):\n    vowels = "aeiou"\n    count = 0\n    for ch in word.lower():\n        if ch in vowels:\n            count += 1\n    return count\n',
    tests: [
      { description: "mixed case", input: ["Hello World"], expected: 3 },
      { description: "no vowels", input: ["xyz"], expected: 0 },
      { description: "empty string", input: [""], expected: 0 },
    ],
    conceptLink: {
      title: "Looping over a string, and membership checks",
      note: "The same accumulator-with-a-condition pattern as count_positives, but iterating over characters and checking set membership instead of a numeric comparison.",
    },
    hintTemplates: {
      H0: "What does looping over a string actually give you, one step at a time?",
      H1: "You can loop over a string's characters directly. Checking if a character is a vowel is the same kind of condition as 'is this number positive?'.",
      H3: "Think about case: does 'E' need separate handling from 'e', or is there a way to avoid that?",
    },
    variations: [
      {
        id: "count-consonants",
        prompt: "Write count_consonants(word) that counts how many letters are consonants (letters that are not vowels).",
        functionName: "count_consonants",
        starterCode: "def count_consonants(word):\n    # your code here\n    pass\n",
        tests: [
          { description: "mixed case", input: ["Hello World"], expected: 7 },
          { description: "all vowels", input: ["aeiou"], expected: 0 },
        ],
        changesOneThing: "Flips the membership condition (not in the vowel set, and must also be a letter) — tests whether the student generalises the condition, not just the vowel list.",
      },
      {
        id: "count-vowels-in-list",
        prompt: "Write count_vowels_in_list(words) that returns the total vowel count across a list of words.",
        functionName: "count_vowels_in_list",
        starterCode: "def count_vowels_in_list(words):\n    # your code here\n    pass\n",
        tests: [
          { description: "typical list", input: [["sky", "blue", "ocean"]], expected: 4 },
          { description: "empty list", input: [[]], expected: 0 },
        ],
        changesOneThing: "A loop over words, each itself looped over — the same loop-inside-a-loop generalisation as the nested-list variations above, reinforced via interleaving on a different exercise.",
      },
    ],
  },
];

export function getExercise(id: string): Exercise | undefined {
  return exerciseBank.find((ex) => ex.id === id);
}
