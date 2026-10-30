// Content for the Ashtanga tab: Patañjali's eight limbs (YS 2.29) and the
// daily-practice parameters tracked under each. Pure data — js/ashtanga.js
// renders it. Parameter ids are stored in each profile's saved data, so
// never rename or reuse one; add new ids instead.
export const ASHTANGA_ANGAS = [
  {
    id: 'yama',
    iast: 'Yama',
    deva: 'यम',
    english: 'Restraints',
    meaning: 'Ethical restraints — how we treat others and the world',
    sutra: 'YS 2.30',
    explanation: 'The yamas are the first limb because practice begins with how we live among others. They are five restraints that keep our actions, words and desires from causing harm, so the mind is not disturbed by guilt, conflict or craving. Patañjali calls them a "great vow" that holds in every place and time (YS 2.31).',
    params: [
      {
        id: 'ahimsa',
        iast: 'Ahiṁsā', deva: 'अहिंसा', english: 'Non-violence',
        meaning: 'Not harming any being — in action, speech or thought — beginning with gentleness towards yourself.',
        examples: [
          'Pause before replying when irritated, and choose words that don\'t wound.',
          'Notice one harsh thought about yourself today and answer it with kindness.',
          'Make one food or purchase choice that causes less harm to animals or the planet.'
        ]
      },
      {
        id: 'satya',
        iast: 'Satya', deva: 'सत्य', english: 'Truthfulness',
        meaning: 'Letting thought, word and action agree, and speaking what is true in a way that helps rather than harms.',
        examples: [
          'Say "I don\'t know" instead of guessing or bluffing.',
          'Keep one small promise exactly as you made it.',
          'Notice an exaggeration as you are about to say it, and say the plain version.'
        ]
      },
      {
        id: 'asteya',
        iast: 'Asteya', deva: 'अस्तेय', english: 'Non-stealing',
        meaning: 'Not taking what is not freely given — things, credit, time or attention — and letting go of envy.',
        examples: [
          'Arrive on time, so you don\'t take others\' time.',
          'Give credit to the person whose idea it really was.',
          'When envy arises at someone\'s success, wish them well instead.'
        ]
      },
      {
        id: 'brahmacharya',
        iast: 'Brahmacarya', deva: 'ब्रह्मचर्य', english: 'Moderation / right use of energy',
        meaning: 'Directing vital energy wisely instead of scattering it on excess — in pleasure, food, talk or stimulation.',
        examples: [
          'Stop eating when you are comfortably satisfied, not full.',
          'Close the app or show at a set time rather than "just one more".',
          'Spend the energy you save on practice, rest or someone who needs you.'
        ]
      },
      {
        id: 'aparigraha',
        iast: 'Aparigraha', deva: 'अपरिग्रह', english: 'Non-possessiveness',
        meaning: 'Not grasping or hoarding; holding things, people and outcomes lightly.',
        examples: [
          'Give away or donate one thing you no longer use.',
          'Skip an impulse purchase and notice the wanting pass.',
          'Do one task well and let go of how others judge the result.'
        ]
      }
    ]
  },
  {
    id: 'niyama',
    iast: 'Niyama',
    deva: 'नियम',
    english: 'Observances',
    meaning: 'Personal observances — how we tend our own body and mind',
    sutra: 'YS 2.32',
    explanation: 'Where the yamas guide how we relate to the world, the niyamas guide how we relate to ourselves. These five disciplines purify the body and mind, steady our attitude and point us towards something greater than our own small concerns.',
    params: [
      {
        id: 'saucha',
        iast: 'Śauca', deva: 'शौच', english: 'Cleanliness / purity',
        meaning: 'Keeping body, surroundings and mind clean and clear, so there is less to cloud awareness.',
        examples: [
          'Clear and wipe your practice or work space before you begin.',
          'Bathe mindfully, feeling the water as a cleansing of mind as well as body.',
          'Avoid one piece of gossip or negative media you would usually take in.'
        ]
      },
      {
        id: 'santosha',
        iast: 'Santoṣa', deva: 'सन्तोष', english: 'Contentment',
        meaning: 'Resting in what is, without constant wanting; Patañjali says it brings unsurpassed happiness (YS 2.42).',
        examples: [
          'Name three things that are already enough in your life today.',
          'When a plan changes, find one thing in the new situation to appreciate.',
          'Catch yourself thinking "I\'ll be happy when…" and come back to now.'
        ]
      },
      {
        id: 'tapas',
        iast: 'Tapas', deva: 'तपस्', english: 'Discipline / austerity',
        meaning: 'Willing effort that burns away inertia and impurity — doing what is right even when it is uncomfortable.',
        examples: [
          'Get up at your intended time without snoozing.',
          'Keep your practice commitment today even if you feel unmotivated.',
          'Fast from one comfort (sugar, phone in bed, complaining) for the day.'
        ]
      },
      {
        id: 'svadhyaya',
        iast: 'Svādhyāya', deva: 'स्वाध्याय', english: 'Self-study',
        meaning: 'Studying sacred texts and studying yourself — your patterns, reactions and motives — in their light.',
        examples: [
          'Read and reflect on one sutra, verse or teaching for ten minutes.',
          'Chant or repeat your mantra with attention to its meaning.',
          'Write down one reaction you had today and what it reveals about you.'
        ]
      },
      {
        id: 'ishvara-pranidhana',
        iast: 'Īśvara Praṇidhāna', deva: 'ईश्वरप्रणिधान', english: 'Surrender / devotion',
        meaning: 'Offering your actions and their results to the Divine (or the Guru), and trusting the larger order.',
        examples: [
          'Begin your work with a short prayer or offering of it.',
          'When something goes wrong, say inwardly "Thy will be done" and let go.',
          'Close the day by offering both its successes and failures.'
        ]
      }
    ]
  },
  {
    id: 'asana',
    iast: 'Āsana',
    deva: 'आसन',
    english: 'Posture',
    meaning: 'A seat that is steady and comfortable',
    sutra: 'YS 2.46–2.48',
    explanation: 'Patañjali defines āsana simply: "sthira sukham āsanam" — posture should be steady and comfortable (YS 2.46). It is mastered by relaxing effort and resting attention on the infinite (2.47), and then the pairs of opposites such as heat and cold no longer disturb us (2.48). Postures prepare the body to sit still for breath work and meditation.',
    params: [
      {
        id: 'sthira',
        iast: 'Sthira', deva: 'स्थिर', english: 'Steadiness',
        meaning: 'Stability and alertness in the body — firm, grounded and still.',
        examples: [
          'Sit for five minutes without shifting or fidgeting.',
          'Hold one balancing pose (such as Tree pose) for a few steady breaths.',
          'Stand with weight evenly on both feet while waiting in a queue.'
        ]
      },
      {
        id: 'sukha',
        iast: 'Sukha', deva: 'सुख', english: 'Ease',
        meaning: 'Comfort and lightness within the posture — no strain, no grimace.',
        examples: [
          'Ease out of any pose where you are holding your breath or clenching your jaw.',
          'Use a cushion or prop so that your seated posture feels comfortable.',
          'Soften the face and shoulders while still holding the pose.'
        ]
      },
      {
        id: 'prayatna-shaithilya',
        iast: 'Prayatna Śaithilya', deva: 'प्रयत्नशैथिल्य', english: 'Relaxing effort',
        meaning: 'Letting unnecessary effort dissolve, so the posture is held by awareness rather than force (YS 2.47).',
        examples: [
          'In each pose, scan for muscles working that don\'t need to, and release them.',
          'Exhale slowly into a stretch instead of pushing deeper.',
          'Rest in Śavāsana for at least five minutes after practice.'
        ]
      },
      {
        id: 'asana-abhyasa',
        iast: 'Āsana Abhyāsa', deva: 'आसन अभ्यास', english: 'Daily asana practice',
        meaning: 'A regular, unbroken practice of postures that keeps the body healthy and fit for sitting.',
        examples: [
          'Do a short sequence (such as Sun Salutations) even on a busy day.',
          'Practise at the same time each day so it becomes natural.',
          'Spend a few minutes on hip openers to make seated meditation easier.'
        ]
      },
      {
        id: 'sharira-sajagata',
        iast: 'Śarīra Sajagatā', deva: 'शरीर सजगता', english: 'Mindful posture through the day',
        meaning: 'Carrying the steadiness and ease of āsana into how you sit, stand and move all day.',
        examples: [
          'Each time you sit down, lengthen the spine and relax the shoulders.',
          'Check your posture at the desk or phone once every hour.',
          'Walk with awareness of each step for a few minutes.'
        ]
      }
    ]
  },
  {
    id: 'pranayama',
    iast: 'Prāṇāyāma',
    deva: 'प्राणायाम',
    english: 'Breath regulation',
    meaning: 'Expanding and regulating the vital energy through the breath',
    sutra: 'YS 2.49–2.51',
    explanation: 'Once the seat is steady, the flow of breath is regulated — inhalation, exhalation and retention are lengthened and refined by place, time and count until the breath becomes long and subtle (YS 2.49–2.50). This calms the nervous system and, Patañjali says, thins the veil over inner light and makes the mind fit for concentration (2.52–2.53).',
    params: [
      {
        id: 'puraka',
        iast: 'Pūraka', deva: 'पूरक', english: 'Inhalation',
        meaning: 'Drawing in breath fully and smoothly, filling the lungs from the abdomen up to the collarbones.',
        examples: [
          'Take ten slow inhalations, filling belly, ribs and chest in turn.',
          'Count the length of your inhale and let it lengthen naturally by a count or two.',
          'Inhale through the nose only, silently and evenly.'
        ]
      },
      {
        id: 'rechaka',
        iast: 'Recaka', deva: 'रेचक', english: 'Exhalation',
        meaning: 'Releasing breath completely and steadily — usually longer than the inhale, which calms the mind.',
        examples: [
          'Practise a 1:2 ratio — exhale for twice as long as you inhale — for three minutes.',
          'When stressed today, take three long exhalations before acting.',
          'Feel the body soften with each out-breath.'
        ]
      },
      {
        id: 'kumbhaka',
        iast: 'Kumbhaka', deva: 'कुम्भक', english: 'Gentle retention',
        meaning: 'A soft, comfortable pause with the breath held in or out — never strained.',
        examples: [
          'Add a short, comfortable pause after each inhale for a few rounds.',
          'Measure your ratio with the Pranayama Ratio tool in Kriya Practice.',
          'Stop the retention at the first sign of strain, gasping or tension.'
        ]
      },
      {
        id: 'dirgha-sukshma',
        iast: 'Dīrgha-Sūkṣma', deva: 'दीर्घसूक्ष्म', english: 'Long and subtle breath',
        meaning: 'Breath that has become long, slow and so fine it is barely felt (YS 2.50).',
        examples: [
          'Breathe so quietly that you can no longer hear the breath.',
          'Notice your natural breath rate, then let it slow without forcing.',
          'Feel the faint touch of air at the nostrils for a few minutes.'
        ]
      },
      {
        id: 'pranayama-abhyasa',
        iast: 'Prāṇāyāma Abhyāsa', deva: 'प्राणायाम अभ्यास', english: 'Daily breathing practice',
        meaning: 'A regular, seated session of prāṇāyāma, done with care and consistency.',
        examples: [
          'Do 5–10 minutes of Nāḍī Śodhana (alternate-nostril breathing).',
          'Practise on an empty stomach, sitting upright, at the same time each day.',
          'Follow prāṇāyāma with a few minutes of sitting still to feel its effect.'
        ]
      }
    ]
  },
  {
    id: 'pratyahara',
    iast: 'Pratyāhāra',
    deva: 'प्रत्याहार',
    english: 'Sense withdrawal',
    meaning: 'Drawing the senses back from their objects',
    sutra: 'YS 2.54',
    explanation: 'Pratyāhāra is when the senses stop chasing their objects and follow the mind inward, as a tortoise draws in its limbs (YS 2.54). It is the bridge between the outer limbs and the inner ones: without it the mind keeps being pulled out by every sight, sound and craving, and concentration cannot begin.',
    params: [
      {
        id: 'indriya-samyama',
        iast: 'Indriya Saṁyama', deva: 'इन्द्रियसंयम', english: 'Sensory moderation',
        meaning: 'Choosing how much stimulation to let in — screens, noise, news — rather than being flooded by it.',
        examples: [
          'Keep the phone out of reach for the first and last hour of the day.',
          'Turn off notifications for two hours while you work or practise.',
          'Spend a meal or a walk without music, podcasts or a screen.'
        ]
      },
      {
        id: 'mitahara',
        iast: 'Mitāhāra', deva: 'मिताहार', english: 'Mindful eating',
        meaning: 'Eating moderately and with attention, tasting food rather than consuming it on autopilot.',
        examples: [
          'Eat one meal in silence, noticing taste, texture and smell.',
          'Put the spoon down between bites and chew slowly.',
          'Pause before eating to offer thanks and check how hungry you really are.'
        ]
      },
      {
        id: 'antar-mauna',
        iast: 'Antar Mauna', deva: 'अन्तर्मौन', english: 'Quiet time with eyes closed',
        meaning: 'A period of sitting with eyes closed and the senses resting, letting outer input fall away.',
        examples: [
          'Sit with eyes closed for ten minutes, simply listening to sounds without labelling them.',
          'Rest your palms over your eyes for a minute between tasks.',
          'Lie in a quiet, dark room for a few minutes before sleep.'
        ]
      },
      {
        id: 'antarmukhata',
        iast: 'Antarmukhatā', deva: 'अन्तर्मुखता', english: 'Turning attention inward',
        meaning: 'Shifting awareness from the outside world to inner sensations, breath and feelings.',
        examples: [
          'Several times today, stop and notice what you feel inside before reacting.',
          'Scan the body from head to toe and feel each part from within.',
          'During a busy moment, take one breath with attention fully on the breath.'
        ]
      },
      {
        id: 'titiksha',
        iast: 'Titikṣā', deva: 'तितिक्षा', english: 'Not reacting to sense triggers',
        meaning: 'Bearing pleasant and unpleasant sensations calmly, without being driven by them.',
        examples: [
          'When a craving arises, wait ten breaths before deciding to act on it.',
          'Let a loud noise or bad smell be there without complaining.',
          'Notice the pull of a tempting notification and leave it unopened for now.'
        ]
      }
    ]
  },
  {
    id: 'dharana',
    iast: 'Dhāraṇā',
    deva: 'धारणा',
    english: 'Concentration',
    meaning: 'Binding the mind to one place',
    sutra: 'YS 3.1',
    explanation: 'Dhāraṇā is fixing the mind on a single place or object — the breath, a mantra, a flame, a point in the body (YS 3.1). The mind will wander; the practice is returning it again and again. It is the first of the three inner limbs, and it naturally ripens into meditation.',
    params: [
      {
        id: 'ekagrata',
        iast: 'Ekāgratā', deva: 'एकाग्रता', english: 'Single-point focus',
        meaning: 'Holding attention on one chosen object — breath, mantra or flame.',
        examples: [
          'Gaze softly at a candle flame (trāṭaka) for two or three minutes.',
          'Repeat your mantra with a mala, attention on each bead.',
          'Rest attention on the sensation of breath at the nostrils.'
        ]
      },
      {
        id: 'eka-karya',
        iast: 'Eka-Kārya', deva: 'एककार्य', english: 'Single-tasking',
        meaning: 'Doing one thing at a time with full attention, rather than splitting the mind.',
        examples: [
          'Work on one task for 25 minutes with every other tab closed.',
          'When talking with someone, put the phone away and only listen.',
          'Wash the dishes or cook while thinking only about that.'
        ]
      },
      {
        id: 'sthira-avadhana',
        iast: 'Sthira Avadhāna', deva: 'स्थिर अवधान', english: 'Steady attention for a set time',
        meaning: 'Choosing a duration and keeping attention on the object for that whole period.',
        examples: [
          'Set a timer for ten minutes of concentration and sit until it rings.',
          'Increase your concentration time by one minute this week.',
          'Read one chapter without checking anything else.'
        ]
      },
      {
        id: 'abhyasa',
        iast: 'Abhyāsa', deva: 'अभ्यास', english: 'Returning the mind when it wanders',
        meaning: 'Persistent, patient effort to bring the mind back (YS 1.13) — without frustration.',
        examples: [
          'Each time you notice the mind has drifted, note "wandering" and gently return.',
          'Count how many times you return in one sitting — more returns is still good practice.',
          'Return with kindness, not criticism.'
        ]
      }
    ]
  },
  {
    id: 'dhyana',
    iast: 'Dhyāna',
    deva: 'ध्यान',
    english: 'Meditation',
    meaning: 'An unbroken flow of attention',
    sutra: 'YS 3.2',
    explanation: 'When concentration becomes continuous — attention flowing towards its object without interruption, like oil poured from one vessel into another — that is dhyāna (YS 3.2). It cannot be forced; it grows out of steady dhāraṇā, a quiet body and a calm breath.',
    params: [
      {
        id: 'asina-dhyana',
        iast: 'Āsīna Dhyāna', deva: 'आसीन ध्यान', english: 'Seated meditation',
        meaning: 'A daily period of sitting still and upright in meditation.',
        examples: [
          'Sit for 15–20 minutes at the same time and place each day.',
          'Begin with a few breaths and a moment of intention or prayer.',
          'If time is short, sit for five minutes rather than skipping.'
        ]
      },
      {
        id: 'ekatanata',
        iast: 'Ekatānatā', deva: 'एकतानता', english: 'Unbroken awareness',
        meaning: 'Attention that keeps flowing without gaps — the defining quality of dhyāna (YS 3.2).',
        examples: [
          'Let concentration relax into a continuous, effortless resting on the object.',
          'Notice the moments when attention flows without strain, and rest in them.',
          'After meditation, keep that same quality for the first few minutes of activity.'
        ]
      },
      {
        id: 'sakshi-bhava',
        iast: 'Sākṣī Bhāva', deva: 'साक्षीभाव', english: 'Witnessing thoughts without judgement',
        meaning: 'Watching thoughts and feelings come and go like clouds, without grabbing or fighting them.',
        examples: [
          'Sit and silently label thoughts as "thinking", then let them pass.',
          'When a strong emotion arises, observe where you feel it in the body.',
          'Notice the gap between one thought and the next.'
        ]
      },
      {
        id: 'mauna',
        iast: 'Mauna', deva: 'मौन', english: 'Silence / stillness practice',
        meaning: 'A period of outer and inner silence that lets the mind settle.',
        examples: [
          'Keep an hour of complete silence — no talking, reading or screens.',
          'Sit in stillness after meditation instead of jumping up.',
          'Spend a few minutes outdoors in silence, just being present.'
        ]
      }
    ]
  },
  {
    id: 'samadhi',
    iast: 'Samādhi',
    deva: 'समाधि',
    english: 'Absorption',
    meaning: 'Complete absorption, where only the object shines',
    sutra: 'YS 3.3',
    explanation: 'In samādhi, meditation deepens until the sense of a separate meditator falls away and only the object of meditation shines (YS 3.3). It is the fruit of the other seven limbs and arrives by grace rather than effort. Daily, we can cultivate the attitudes that turn us towards it: presence, witnessing, gratitude and honest reflection.',
    params: [
      {
        id: 'vartamana-jagriti',
        iast: 'Vartamāna Jāgṛti', deva: 'वर्तमान जागृति', english: 'Present-moment awareness',
        meaning: 'Being fully here, now, without drifting into past regrets or future worries.',
        examples: [
          'Choose three moments today to stop and feel exactly where you are.',
          'Drink a cup of tea or water with complete attention.',
          'When planning or remembering, notice it, and return to now.'
        ]
      },
      {
        id: 'drashtri-bhava',
        iast: 'Draṣṭṛ Bhāva', deva: 'द्रष्टृभाव', english: 'Witness consciousness',
        meaning: 'Resting as the seer — the pure awareness that is aware of body, mind and world (YS 1.3).',
        examples: [
          'Ask inwardly "Who is aware of this?" and rest in the silence that follows.',
          'Through the day, recall that you are the one observing the mind, not the mind itself.',
          'Notice that awareness is unchanged whether you are happy or upset.'
        ]
      },
      {
        id: 'ekatva-bhavana',
        iast: 'Ekatva Bhāvanā', deva: 'एकत्वभावना', english: 'Gratitude / oneness reflection',
        meaning: 'Feeling gratitude and the underlying unity of all beings, beyond "me" and "them".',
        examples: [
          'Silently thank three people, beings or forces that supported your day.',
          'Look at someone you find difficult and remember the same life is in them.',
          'Spend a few minutes feeling connected to nature — sky, trees, earth.'
        ]
      },
      {
        id: 'sayam-atma-nirikshana',
        iast: 'Sāyaṁ Ātma-Nirīkṣaṇa', deva: 'सायं आत्मनिरीक्षण', english: 'Evening reflection on the day',
        meaning: 'Reviewing the day honestly and without judgement before sleep, then letting it go.',
        examples: [
          'Before sleep, replay the day in reverse and note moments of awareness and forgetfulness.',
          'Note one thing to do differently tomorrow, then release the day.',
          'Write a few lines in your Journal\'s Evening Reflection.'
        ]
      }
    ]
  }
];
