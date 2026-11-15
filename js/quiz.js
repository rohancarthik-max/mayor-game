/* quiz.js - optional warm-up (before Level 1) and check-out (after Level 5) questions.
 * Each set has one question per idea, in the same order, with DIFFERENT but equivalent
 * scenarios, so pre vs post scores can be compared without simply remembering answers. */
(function (M) {
  'use strict';
  M.quiz = {
    pre: [
      { concept: 'confounding',
        q: 'In a city, on days when more fans are sold, more people get sunburnt. What is the best explanation?',
        options: ['Fans cause sunburn.', 'Hot, sunny days cause both more fan sales and more sunburn.', 'Sunburn makes people buy fans.', 'It must be a coincidence, so ignore it.'],
        correct: 1, why: 'Hot weather is a common cause (a confounder) of both.' },
      { concept: 'reverse',
        q: 'Hospitals with more ICU beds have more patients who die. A minister proposes cutting ICU beds. What is the most likely problem with this reasoning?',
        options: ['Nothing; ICU beds clearly cause deaths.', 'The sickest patients are sent where ICU beds are, so serious illness causes more beds, not the other way round.', 'The data must be wrong.', 'Deaths and beds are unrelated.'],
        correct: 1, why: 'Reverse causation: severe illness leads to more ICU beds.' },
      { concept: 'rct',
        q: 'Farmers who used a new fertiliser got bigger harvests, but mostly richer farmers with better land used it. What is the best way to find out if the fertiliser itself works?',
        options: ['Compare users with non-users again, with more farmers.', 'Ask farmers whether they think it worked.', 'Pick fields at random (for example by coin toss) to get the fertiliser, and compare them with the rest.', 'Use it on the best fields only.'],
        correct: 2, why: 'Random assignment makes the two groups alike except for the fertiliser.' }
    ],
    post: [
      { concept: 'confounding',
        q: 'In a town, weeks with more umbrella sales also have more traffic jams. Should the town ban umbrellas to cut traffic?',
        options: ['Yes, umbrellas cause traffic jams.', 'No, rainy weather causes both more umbrella sales and more traffic jams.', 'Yes, but only on weekdays.', 'No, because the link is too weak to matter.'],
        correct: 1, why: 'Rain is a confounder: a common cause of both.' },
      { concept: 'reverse',
        q: 'Schools with more remedial teachers have lower average marks. Should the remedial teachers be removed?',
        options: ['Yes, remedial teachers lower marks.', 'No, schools with low marks are the ones that hire remedial teachers, so low marks cause the teachers.', 'Yes, to save money.', 'It does not matter either way.'],
        correct: 1, why: 'Reverse causation: low marks lead to hiring remedial teachers.' },
      { concept: 'rct',
        q: 'Patients who took a new medicine recovered faster, but doctors mostly gave it to younger, healthier patients. What is the best way to find out if the medicine works?',
        options: ['Give it to more young patients and compare.', 'Randomly assign the medicine (for example by coin toss) and compare recovery with patients who didn\'t get it.', 'Ask doctors which patients improved most.', 'Compare this year\'s patients with last year\'s.'],
        correct: 1, why: 'Randomisation balances age, health and everything else, so any difference is due to the medicine.' }
    ]
  };
})(globalThis.Mayor = globalThis.Mayor || {});
