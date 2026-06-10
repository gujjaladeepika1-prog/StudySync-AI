import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

declare const process: {
  env: {
    LOVABLE_API_KEY?: string;
    LOVABLE_MODEL?: string;
    OPENAI_API_KEY?: string;
    AI_API_KEY?: string;
    AI_API_URL?: string;
    AI_MODEL?: string;
  };
};

// Server-side AI generation for PYQ / Sample questions.
//
// Flow:
// 1. UI submits exam/year/subject/topic/mode/count to the server function.
// 2. The server-side function calls the configured AI provider.
// 3. Provider credentials, when configured, stay on the server only.
// 4. The response is parsed as strict JSON and returned to the UI.
const LOVABLE_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

const CHAT_MODELS = [
  "gemini-3-flash-preview",
  "gemini-3.5-flash",
  "gemini-3.1-pro-preview",
  "gemini-3.1-flash-lite-preview",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gpt-5.5",
  "gpt-5.5-pro",
  "gpt-5.4",
  "gpt-5.4-pro",
  "gpt-5.4-mini",
  "gpt-5.4-nano",
  "gpt-5.2",
  "gpt-5",
  "gpt-5-mini",
  "gpt-5-nano",
] as const;

const CHAT_MODEL_SET = new Set<string>(CHAT_MODELS);

const normalizeChatModel = (model?: string) => (model && CHAT_MODEL_SET.has(model) ? model : undefined);

export type GeneratedQuestion = {
  question: string;
  options?: string[];
  answer?: string;
  solution?: string;
  difficulty?: string;
  year?: string;
  exam?: string;
  topic?: string;
};

type QuestionRequest = {
  mode: "pyq" | "sample";
  exam: string;
  subject: string;
  topic?: string;
  year?: string;
  count: number;
};

const normalizeSubject = (subject: string) => {
  const s = subject.toLowerCase().replace(/[^a-z]/g, "");
  if (["physcs", "phy", "physics", "phys", "physis"].includes(s)) return "physics";
  if (["math", "maths", "mathematics", "mathematics"].includes(s)) return "mathematics";
  if (["chem", "chemistry"].includes(s)) return "chemistry";
  if (["bio", "biology", "biol"].includes(s)) return "biology";
  if (["reasoning", "reasoining", "reason", "logicalreasoning", "lr", "logical"].includes(s)) return "reasoning";
  if (["english", "eng", "language", "englishlanguage", "englishlit", "englishliterature", "literature", "grammar", "comprehension"].includes(s)) return "english";
  if (["history", "his", "stories", "civics"].includes(s)) return "history";
  if (["geo", "geography", "landforms", "maps"].includes(s)) return "geography";
  if (["economics", "eco", "economy", "econ"].includes(s)) return "economics";
  if (["computer", "computerscience", "cs", "informatics", "programming"].includes(s)) return "computer science";
  if (["commerce", "businessstudies", "business", "accounting", "accounts", "finance"].includes(s)) return "commerce";
  if (["psychology", "psy"].includes(s)) return "psychology";
  if (["sociology", "socio"].includes(s)) return "sociology";
  if (["politicalscience", "politics", "polscience", "polisci"].includes(s)) return "political science";
  if (["gk", "generalawareness", "generalknowledge", "generalawareness", "generalknowledge", "general awareness", "general knowledge"].includes(s)) return "general-awareness";
  if (["aptitude", "quant", "qa", "quantitativeaptitude", "quantitative aptitude"].includes(s)) return "aptitude";
  return s || "general";
};

const dedupeQuestions = (questions: GeneratedQuestion[]) => {
  const seen = new Set<string>();
  const unique: GeneratedQuestion[] = [];
  for (const question of questions) {
    const key = question.question.trim();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(question);
    }
  }
  return unique;
};

const generateMathFallback = (index: number): GeneratedQuestion => {
  const templateIndex = index % 10;
  const a = 2 + (index % 9);
  const b = 3 + ((index * 2) % 7);
  const c = 4 + ((index * 3) % 6);
  const t = 2 + (index % 5);
  const speedDistance = 20 + ((index % 8) * 5);
  const speedTime = 2 + (index % 6);
  const percentBase = 10 + ((index % 6) * 5);
  const percentValue = percentBase * 1.2;
  const ratioA = 2 + ((index * 3) % 7);
  const ratioB = 3 + ((index * 5) % 8);
  const areaBase = 3 + (index % 6);
  const volumeBase = 2 + ((index + 1) % 5);

  if (templateIndex === 0) {
    const root1 = a;
    const root2 = b;
    const sum = root1 + root2;
    const product = root1 * root2;
    return {
      question: `Solve the quadratic equation x^2 - ${sum}x + ${product} = 0.`,
      answer: `x = ${root1} or x = ${root2}`,
      solution: `Factorize x^2 - ${sum}x + ${product} into (x - ${root1})(x - ${root2}). Set each factor equal to zero to get x = ${root1} or x = ${root2}.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 1) {
    const angle = 30 + ((index % 3) * 15);
    return {
      question: `Find the value of sin^2 ${angle}° + cos^2 ${angle}°.`,
      answer: "1",
      solution: "This is a standard trigonometric identity: sin^2 θ + cos^2 θ = 1 for every angle θ.",
      difficulty: "easy",
    };
  }

  if (templateIndex === 2) {
    const target = 8 + (index % 5);
    return {
      question: `If the arithmetic mean of ${a}, ${b}, x, and ${c} is ${target}, find x.`,
      answer: `${target * 4 - a - b - c}`,
      solution: `The mean of these four numbers is ${target}, so their sum is ${target * 4}. Therefore x = ${target * 4} - (${a} + ${b} + ${c}) = ${target * 4 - a - b - c}.`,
      difficulty: "easy",
    };
  }

  if (templateIndex === 3) {
    return {
      question: `A train covers ${speedDistance} km in ${speedTime} hours. What is its average speed?`,
      answer: `${(speedDistance / speedTime).toFixed(2)} km/h`,
      solution: `Speed = distance/time = ${speedDistance}/${speedTime} = ${(speedDistance / speedTime).toFixed(2)} km/h.`,
      difficulty: "easy",
    };
  }

  if (templateIndex === 4) {
    const original = percentBase;
    const increased = Math.round(original * 1.2);
    return {
      question: `A number is increased by 20% and becomes ${increased}. What was the original number?`,
      answer: `${original}`,
      solution: `If the original number is x, then x × 1.2 = ${increased}. So x = ${increased} ÷ 1.2 = ${original}.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 5) {
    const coeff = 1 + (index % 5);
    const constant = 5 + ((index * 2) % 10);
    return {
      question: `Solve for x: ${coeff}x + ${constant} = ${coeff * 3 + constant}.`,
      answer: `x = 3`,
      solution: `Subtract ${constant} from both sides and divide by ${coeff}: x = (${coeff * 3 + constant} - ${constant}) / ${coeff} = 3.`,
      difficulty: "easy",
    };
  }

  if (templateIndex === 6) {
    return {
      question: `If ${ratioA} men can finish a job in ${ratioB} days, how many days will ${ratioA * 2} men take working at the same rate?`,
      answer: `${Math.round((ratioA * ratioB) / (ratioA * 2))} days`,
      solution: `Work is inversely proportional to men. If ${ratioA} men take ${ratioB} days, then ${ratioA * 2} men take ${ratioA * ratioB} / ${ratioA * 2} = ${Math.round((ratioA * ratioB) / (ratioA * 2))} days.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 7) {
    return {
      question: `Find the area of a rectangle with sides ${areaBase} cm and ${areaBase + 2} cm.`,
      answer: `${areaBase * (areaBase + 2)} cm^2`,
      solution: `Area = length × width = ${areaBase} × ${areaBase + 2} = ${areaBase * (areaBase + 2)} cm^2.`,
      difficulty: "easy",
    };
  }

  if (templateIndex === 8) {
    return {
      question: `What is the probability of drawing a red ball from a bag containing ${a} red and ${b} blue balls?`,
      answer: `${a}/${a + b}`,
      solution: `Probability = number of favorable outcomes ÷ total outcomes = ${a} / (${a} + ${b}) = ${a}/${a + b}.`,
      difficulty: "easy",
    };
  }

  return {
    question: `The sum of two numbers is ${a + b} and their difference is ${b - a}. Find the numbers.`,
    answer: `The numbers are ${b} and ${a}.`,
    solution: `Let the numbers be x and y with x + y = ${a + b} and y - x = ${b - a}. Solve to get x = ${a} and y = ${b}.`,
    difficulty: "medium",
  };
};

const generatePhysicsFallback = (index: number): GeneratedQuestion => {
  const templateIndex = index % 10;
  const a = 2 + (index % 6);
  const t = 2 + (index % 5);
  const f = 5 + ((index * 2) % 16);
  const g = 9 + (index % 3);
  const r = 5 + ((index + 1) % 10);
  const v = 6 + ((index * 3) % 19);
  const h = 20 + ((index % 5) * 10);
  const m = 2 + ((index % 5) * 2);
  const area = 2 + (index % 6);
  const volume = 3 + ((index + 2) % 5);
  const work = 10 + ((index % 7) * 5);

  if (templateIndex === 0) {
    return {
      question: `A body starts from rest and accelerates uniformly at ${a} m/s^2 for ${t} s. What distance does it cover?`,
      answer: `${(0.5 * a * t * t).toFixed(2)} m`,
      solution: `Use s = ut + 1/2 at^2 with u = 0. So s = 1/2 × ${a} × ${t}^2 = ${(0.5 * a * t * t).toFixed(2)} m.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 1) {
    return {
      question: `A ${r} Ω resistor is connected across a ${v} V source. Calculate the current through the resistor.`,
      answer: `${(v / r).toFixed(2)} A`,
      solution: `By Ohm's law, I = V/R = ${v}/${r} = ${(v / r).toFixed(2)} A.`,
      difficulty: "easy",
    };
  }

  if (templateIndex === 2) {
    return {
      question: `A convex lens has focal length ${f} cm. What is its power in dioptres?`,
      answer: `+${(100 / f).toFixed(2)} D`,
      solution: `Power P = 1/f (in metres). Here f = ${f} cm = ${ (f / 100).toFixed(2) } m, so P = 1/${ (f / 100).toFixed(2) } = +${ (100 / f).toFixed(2) } D.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 3) {
    return {
      question: `A stone is dropped from a height of ${h} m. Taking g = ${g} m/s^2, find the time taken to reach the ground.`,
      answer: `${Math.sqrt((2 * h) / g).toFixed(2)} s`,
      solution: `Using h = 1/2 g t^2, solve t^2 = 2h/g = ${ (2 * h) / g }. Then t = √${ (2 * h) / g } = ${ Math.sqrt((2 * h) / g).toFixed(2) } s.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 4) {
    return {
      question: `A force of ${work} N moves an object through ${t} m. Calculate the work done.`,
      answer: `${work * t} J`,
      solution: `Work = force × distance = ${work} × ${t} = ${work * t} J.`,
      difficulty: "easy",
    };
  }

  if (templateIndex === 5) {
    return {
      question: `A mass of ${m} kg is accelerated at ${a} m/s^2. What is the required force?`,
      answer: `${(m * a).toFixed(2)} N`,
      solution: `Use F = ma, so F = ${m} × ${a} = ${(m * a).toFixed(2)} N.`,
      difficulty: "easy",
    };
  }

  if (templateIndex === 6) {
    return {
      question: `A liquid of density ${area} g/cm^3 occupies a volume of ${volume} cm^3. Find its mass.`,
      answer: `${area * volume} g`,
      solution: `Mass = density × volume = ${area} × ${volume} = ${area * volume} g.`,
      difficulty: "easy",
    };
  }

  if (templateIndex === 7) {
    const powerTime = 2 + ((index + 1) % 5);
    return {
      question: `A machine does ${work * 2} J of work in ${powerTime} s. What is its power?`,
      answer: `${((work * 2) / powerTime).toFixed(2)} W`,
      solution: `Power = work/time = ${work * 2}/${powerTime} = ${((work * 2) / powerTime).toFixed(2)} W.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 8) {
    const pressureArea = 4 + (index % 5);
    const forceValue = 50 + ((index % 6) * 10);
    return {
      question: `A force of ${forceValue} N acts over an area of ${pressureArea} cm^2. Calculate the pressure in N/m^2 (Pa).`,
      answer: `${((forceValue / pressureArea) * 10000).toFixed(0)} Pa`,
      solution: `Convert area to m^2: ${pressureArea} cm^2 = ${pressureArea / 10000} m^2. Pressure = force/area = ${forceValue} / ${ (pressureArea / 10000).toFixed(4) } = ${((forceValue / pressureArea) * 10000).toFixed(0)} Pa.`,
      difficulty: "medium",
    };
  }

  return {
    question: `A ball of mass ${m} kg is thrown with velocity ${a * 2} m/s. What is its kinetic energy?`,
    answer: `${(0.5 * m * Math.pow(a * 2, 2)).toFixed(2)} J`,
    solution: `Kinetic energy = 1/2 mv^2 = 1/2 × ${m} × (${a * 2})^2 = ${(0.5 * m * Math.pow(a * 2, 2)).toFixed(2)} J.`,
    difficulty: "medium",
  };
};

const generateReasoningFallback = (index: number): GeneratedQuestion => {
  const templateIndex = index % 8;
  const seriesSets: Array<{ series: string; next: number; method: string }> = [
    { series: "2, 5, 10, 17, 26", next: 37, method: "each term is one more than a square number (1+1, 4+1, 9+1, 16+1, 25+1)" },
    { series: "3, 6, 12, 24, 48", next: 96, method: "each term is multiplied by 2" },
    { series: "4, 7, 11, 16, 22", next: 29, method: "the differences increase by 1 each time: 3, 4, 5, 6" },
  ];

  if (templateIndex === 0) {
    const item = seriesSets[index % seriesSets.length];
    return {
      question: `Find the next number in the series: ${item.series}, ... and explain the rule.`,
      answer: `${item.next}`,
      solution: `The series ${item.series} follows a clear pattern: ${item.method}. Therefore the next number is ${item.next}.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 1) {
    return {
      question: `Which item is the odd one out: Apple, Banana, Orange, Carrot? Explain your reasoning.`,
      answer: `Carrot is the odd one out because it is a vegetable while the others are fruits.`,
      solution: `Apple, Banana, and Orange are all fruits. Carrot is a vegetable, so it is different by food category and is the odd one out.`,
      difficulty: "easy",
    };
  }

  if (templateIndex === 2) {
    return {
      question: `Riya walks 10 m north, then turns right and walks 5 m, then turns right again and walks 10 m. Which direction is she facing now? Explain your logic.`,
      answer: `South`,
      solution: `Starting north, the first right turn makes her face east. The second right turn makes her face south. Therefore she is facing south.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 3) {
    return {
      question: `If all cats are animals and some animals are furry, which of the following is definitely true? Explain your reasoning.`,
      answer: `Some cats may be furry, but not all cats are necessarily furry.`,
      solution: `All cats belong to the animal group. Since only some animals are furry, we cannot conclude that all cats are furry. The definite statement is that some cats may be furry.`,
      difficulty: "hard",
    };
  }

  if (templateIndex === 4) {
    return {
      question: `Complete the analogy: Bird is to Nest as Fish is to ____. Explain the relationship.`,
      answer: `Water`,
      solution: `A nest is the natural place where a bird lives or rests. Similarly, water is the natural place where a fish lives. The relationship is habitat to animal.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 5) {
    return {
      question: `In a row of eight students labeled A to H, C is third from the left and F is two places to the right of C. What is F’s position from the left? Explain your reasoning.`,
      answer: `Sixth from the left`,
      solution: `If C is third from the left and F is two positions to the right of C, then F is third + 2 = fifth from the left. However, because we count C as third, F becomes the sixth position overall.`,
      difficulty: "hard",
    };
  }

  if (templateIndex === 6) {
    return {
      question: `A pattern alternates between even numbers and prime numbers: 2, 3, 4, ... What is the next term? Explain the rule.`,
      answer: `5`,
      solution: `The pattern alternates an even number and then a prime number. After 2 (even), 3 (prime), and 4 (even), the next term must be the next prime number, which is 5.`,
      difficulty: "medium",
    };
  }

  return {
    question: `Given the statements: all dogs are animals, some animals are pets, is it true that all pets are dogs? Explain your reasoning.`,
    answer: `No, not all pets are dogs.`,
    solution: `All dogs belong to animals, and some animals are pets. This does not imply that all pets are dogs. Pets can also include cats, birds, and other animals.`,
    difficulty: "medium",
  };
};

const generateChemistryFallback = (index: number): GeneratedQuestion => {
  const templateIndex = index % 10;
  const coefficient = 2 + (index % 4);
  const mass = 18 + ((index % 5) * 2);
  const volume = 1 + (index % 4);
  const mol = 0.5 + ((index % 4) * 0.5);
  const acid = ["HCl", "H2SO4", "HNO3"][index % 3];
  const base = ["NaOH", "KOH", "Ca(OH)2"][index % 3];
  const gas = ["CO2", "O2", "H2"][index % 3];
  const compound = ["NaCl", "CaCO3", "CH4"][index % 3];

  if (templateIndex === 0) {
    return {
      question: `Balance the equation: ${coefficient}Fe + O2 -> Fe2O3. State the balanced coefficients.`,
      answer: `4Fe + 3O2 -> 2Fe2O3`,
      solution: `To balance Fe, use 4 atoms on both sides and 3O2 gives 6 oxygen atoms, which match 2Fe2O3. Thus the balanced equation is 4Fe + 3O2 -> 2Fe2O3.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 1) {
    return {
      question: `Calculate the mass of ${compound} required for 0.5 mol.`,
      answer: `${mol * 16} g`,
      solution: `Molar mass of ${compound} is 16 g/mol. For 0.5 mol, mass = 0.5 × 16 = ${mol * 16} g.`,
      difficulty: "easy",
    };
  }

  if (templateIndex === 2) {
    return {
      question: `What type of compound is ${acid} when dissolved in water? Explain.`,
      answer: `An acid, because it releases H+ ions in water.`,
      solution: `${acid} dissociates to release H+ ions in aqueous solution, which is the definition of an acid.`,
      difficulty: "easy",
    };
  }

  if (templateIndex === 3) {
    return {
      question: `Describe one property of ${compound} and its common use.`,
      answer: `${compound} is often used in basic reactions or fuel and is characterized by its simple molecular structure.`,
      solution: `${compound} is a small molecule. For example, CH4 is a fuel gas used for heating and combustion.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 4) {
    return {
      question: `Write the chemical equation for neutralization of ${acid} with ${base}.`,
      answer: `${acid} + ${base} -> salt + H2O`,
      solution: `A strong acid and strong base react to form a salt and water. The balanced form is ${acid} + ${base} -> salt + H2O.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 5) {
    return {
      question: `How many moles of gas are present in ${volume} L at STP?`,
      answer: `${(volume / 22.4).toFixed(2)} mol`,
      solution: `At STP, 1 mol gas occupies 22.4 L. So moles = ${volume} / 22.4 = ${(volume / 22.4).toFixed(2)} mol.`,
      difficulty: "easy",
    };
  }

  if (templateIndex === 6) {
    return {
      question: `Explain the difference between an element and a compound with one example each.`,
      answer: `An element has only one type of atom, e.g. O2; a compound has two or more types of atoms, e.g. H2O.`,
      solution: `Elements contain one kind of atom. Compounds are chemical combinations of different atoms. O2 is an element and H2O is a compound.`,
      difficulty: "easy",
    };
  }

  if (templateIndex === 7) {
    return {
      question: `What is the pH nature of a solution formed by mixing equal concentrations of ${acid} and ${base}?`,
      answer: `Neutral or approximately pH 7.`,
      solution: `A strong acid and strong base in equal amounts neutralize each other, creating a neutral solution with pH near 7.`,
      difficulty: "medium",
    };
  }

  return {
    question: `Explain the concept of mole in chemistry and why it is useful.`,
    answer: `A mole is a counting unit for atoms and molecules; it allows chemists to measure substances by number of particles.`,
    solution: `A mole equals 6.022×10^23 particles. This standard quantity helps relate mass to number of atoms and molecules in calculations.`,
    difficulty: "medium",
  };
};

const generateBiologyFallback = (index: number, subject: string): GeneratedQuestion => {
  const templateIndex = index % 10;
  const organs = ["heart", "lungs", "leaf", "roots", "stomach"];
  const functions = ["pumping blood", "gas exchange", "photosynthesis", "water uptake", "digestion"];
  const animal = ["fish", "camel", "eagle", "frog", "human"][index % 5];
  const feature = ["gills", "humps", "wings", "moist skin", "brain"][index % 5];

  if (templateIndex === 0) {
    return {
      question: `Explain the primary function of the ${organs[index % organs.length]} in ${subject}.`,
      answer: `It is responsible for ${functions[index % functions.length]}.`,
      solution: `The ${organs[index % organs.length]} performs the key role of ${functions[index % functions.length]}, which is vital for the organism's survival.`,
      difficulty: "easy",
    };
  }

  if (templateIndex === 1) {
    return {
      question: `Describe one adaptation of a ${animal} and explain its benefit.`,
      answer: `The ${animal} uses ${feature[index % feature.length]} to survive in its environment.`,
      solution: `This adaptation helps the ${animal} by improving ${feature[index % feature.length]} function, which supports survival in its habitat.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 2) {
    return {
      question: `What is the role of DNA in living organisms?`,
      answer: `DNA stores genetic information and directs protein synthesis.`,
      solution: `DNA contains genes that code for proteins. These proteins determine traits and control cell functions, making DNA essential for inheritance and cell activity.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 3) {
    return {
      question: `Explain how photosynthesis supports life on Earth.`,
      answer: `Photosynthesis converts sunlight into chemical energy and produces oxygen.`,
      solution: `Plants use sunlight, water, and carbon dioxide to make glucose and oxygen. This provides food and oxygen for many organisms.`,
      difficulty: "easy",
    };
  }

  if (templateIndex === 4) {
    return {
      question: `Differentiate between respiration and photosynthesis in one sentence.`,
      answer: `Respiration releases energy from food, while photosynthesis stores energy in glucose.`,
      solution: `Respiration breaks down glucose to release energy. Photosynthesis builds glucose using sunlight energy.`,
      difficulty: "easy",
    };
  }

  if (templateIndex === 5) {
    return {
      question: `Name one function of the human immune system and explain its importance.`,
      answer: `It defends the body against infections and helps maintain health.`,
      solution: `The immune system identifies and destroys pathogens, preventing disease and keeping the body functioning.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 6) {
    return {
      question: `What is a food chain? Give one example.`,
      answer: `A food chain shows how energy passes from one organism to another, for example grass -> rabbit -> fox.`,
      solution: `Energy moves from producers to consumers in a linear sequence. The example demonstrates this flow from plants to herbivores to carnivores.`,
      difficulty: "easy",
    };
  }

  if (templateIndex === 7) {
    return {
      question: `Explain one reason why biodiversity is important to ecosystems.`,
      answer: `Biodiversity increases ecosystem resilience and stability.`,
      solution: `A variety of species ensures that ecosystems can adapt to changes and continue functioning, which supports long-term survival.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 8) {
    return {
      question: `Describe the role of the human brain in coordination.`,
      answer: `The brain processes information and sends signals to muscles and organs.`,
      solution: `It receives sensory input, interprets it, and issues coordinated responses, allowing complex movement and behavior.`,
      difficulty: "medium",
    };
  }

  return {
    question: `What is an ecosystem? Explain one example.`,
    answer: `An ecosystem is a community of living organisms and their physical environment, such as a pond ecosystem.`,
    solution: `It includes plants, animals, microbes, water, and soil interacting together. A pond ecosystem contains fish, insects, algae, and water that depend on each other.`,
    difficulty: "easy",
  };
};

const generateHistoryFallback = (index: number): GeneratedQuestion => {
  const templateIndex = index % 8;
  const events = [
    "the Industrial Revolution",
    "the Indian National Movement",
    "the French Revolution",
    "the American Civil War",
    "the Renaissance",
  ];
  const leaders = ["Mahatma Gandhi", "Nelson Mandela", "Winston Churchill", "Queen Victoria", "Abraham Lincoln"];
  const reforms = ["land reform", "education reform", "tax reform", "social reform", "legal reform"];

  if (templateIndex === 0) {
    return {
      question: `Explain one major cause of ${events[index % events.length]}.`,
      answer: `A major cause was social and economic change during the period.`,
      solution: `${events[index % events.length]} began because of deep social and economic pressures that made existing systems unsustainable.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 1) {
    return {
      question: `Describe one contribution of ${leaders[index % leaders.length]} to history.`,
      answer: `They led a movement that changed society and inspired political transformation.`,
      solution: `${leaders[index % leaders.length]} influenced history by leading people, shaping policies, and promoting major change.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 2) {
    return {
      question: `What was the significance of ${reforms[index % reforms.length]} in its era?`,
      answer: `It improved fairness and stability in society by changing laws or institutions.`,
      solution: `Such reform addressed a key problem of the time and helped create a more balanced social order.`,
      difficulty: "easy",
    };
  }

  if (templateIndex === 3) {
    return {
      question: `Bring out one similarity between ${events[0]} and ${events[1]}.`,
      answer: `Both involved large-scale change in society and the economy.`,
      solution: `These events were driven by major shifts in technology, social structure, or political power, causing widespread change.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 4) {
    return {
      question: `Explain why source-based history questions ask for both facts and interpretation.`,
      answer: `Because they test knowledge and the ability to draw conclusions from evidence.`,
      solution: `Historical sources provide data; interpretation shows what that data means, so both skills are required.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 5) {
    return {
      question: `What is the purpose of a constitution in a modern state?`,
      answer: `It establishes fundamental laws and protects citizens' rights.`,
      solution: `A constitution sets out the rules for governance and limits state power while safeguarding liberties.`,
      difficulty: "easy",
    };
  }

  if (templateIndex === 6) {
    return {
      question: `Name one long-term effect of colonial rule on a colonized region.`,
      answer: `It often changed the economy, governance, or social structure in lasting ways.`,
      solution: `Colonial rule introduced new systems and resources that continued to shape the region after independence.`,
      difficulty: "medium",
    };
  }

  return {
    question: `How does studying history help students understand the present?`,
    answer: `History reveals how past decisions and events shape current society.`,
    solution: `By learning past causes and effects, students can better understand modern institutions, conflicts, and cultures.`,
    difficulty: "easy",
  };
};

const generateGeographyFallback = (index: number): GeneratedQuestion => {
  const templateIndex = index % 8;
  const physical = ["erosion", "weathering", "volcanoes", "river meanders", "earthquakes"];
  const human = ["urbanization", "migration", "agriculture", "industry", "tourism"];
  const regions = ["desert", "coastal area", "mountain region", "river valley", "rainforest"];

  if (templateIndex === 0) {
    return {
      question: `Explain one cause of ${physical[index % physical.length]}.`,
      answer: `It happens because of natural forces such as wind, water, or tectonic movement.`,
      solution: `${physical[index % physical.length]} results from natural energy moving earth materials or changing landscapes over time.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 1) {
    return {
      question: `Describe one effect of ${human[index % human.length]} on the environment.`,
      answer: `It changes land use, resource demand, or ecological balance.`,
      solution: `${human[index % human.length]} alters how people interact with landscapes, often causing new environmental pressures.`,
      difficulty: "easy",
    };
  }

  if (templateIndex === 2) {
    return {
      question: `How does climate affect life in a ${regions[index % regions.length]}?`,
      answer: `Climate determines the vegetation, wildlife, and human activities suited to that region.`,
      solution: `The temperature and rainfall patterns of a ${regions[index % regions.length]} shape its ecosystems and the way people live there.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 3) {
    return {
      question: `What is a watershed, and why is it important?`,
      answer: `A watershed drains water into a common outlet, and it is important for water management.`,
      solution: `A watershed collects rainfall and directs it into rivers or lakes, affecting water supply and land use planning.`,
      difficulty: "easy",
    };
  }

  if (templateIndex === 4) {
    return {
      question: `Explain the role of natural resources in regional development.`,
      answer: `Natural resources support industry, agriculture, and infrastructure growth.`,
      solution: `Resources such as water, minerals, and fertile soil attract investment and shape economic patterns in a region.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 5) {
    return {
      question: `Compare a coastal area with a mountain region in one way.`,
      answer: `A coastal area has sea influence, while a mountain region has higher altitude and cooler climate.`,
      solution: `Coastal areas experience maritime climate effects and access to the sea, whereas mountains are shaped by height and terrain.`,
      difficulty: "easy",
    };
  }

  if (templateIndex === 6) {
    return {
      question: `What is sustainable development, and why is it essential?`,
      answer: `It meets present needs without harming future generations.`,
      solution: `Sustainable development balances economic growth, social welfare, and environmental protection for the long term.`,
      difficulty: "medium",
    };
  }

  return {
    question: `Define a population and give one example of how it is measured.`,
    answer: `A population is a group of people in an area; it can be measured by census count.`,
    solution: `Geographers measure population size, density, or growth using data from surveys or censuses.`,
    difficulty: "easy",
  };
};

const generateEconomicsFallback = (index: number): GeneratedQuestion => {
  const templateIndex = index % 8;
  const terms = ["demand", "supply", "inflation", "GDP", "fiscal policy"];
  const quantities = [100, 200, 300, 400, 500];
  const prices = [10, 20, 30, 40, 50];

  if (templateIndex === 0) {
    return {
      question: `Define ${terms[index % terms.length]} and give one example.`,
      answer: `${terms[index % terms.length]} refers to ${terms[index % terms.length]} in the economy.`,
      solution: `This concept describes how ${terms[index % terms.length]} works in markets, such as how prices or production respond to changes.`,
      difficulty: "easy",
    };
  }

  if (templateIndex === 1) {
    return {
      question: `If quantity demanded rises from ${quantities[index % quantities.length]} to ${quantities[(index + 1) % quantities.length]} when price falls, what does this indicate?`,
      answer: `It indicates a normal demand response to a lower price.`,
      solution: `Demand typically increases when price decreases; this shows the law of demand in action.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 2) {
    return {
      question: `Explain the impact of a government subsidy on ${terms[index % terms.length]}.`,
      answer: `A subsidy lowers costs and increases supply or consumption.`,
      solution: `Subsidies reduce producer or consumer cost, shifting supply/demand and influencing market outcomes.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 3) {
    return {
      question: `What is GDP and why is it used as an economic indicator?`,
      answer: `GDP measures the total value of goods and services produced in an economy.`,
      solution: `GDP indicates economic size and growth, helping compare performance over time and across countries.`,
      difficulty: "easy",
    };
  }

  if (templateIndex === 4) {
    return {
      question: `Describe one consequence of high inflation.`,
      answer: `High inflation reduces purchasing power and uncertainty in the economy.`,
      solution: `When prices rise rapidly, consumers can buy less with the same income, which can harm savings and investment.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 5) {
    return {
      question: `What role does interest rate policy play in controlling inflation?`,
      answer: `Higher interest rates can reduce inflation by slowing demand.`,
      solution: `Central banks raise rates to make borrowing more expensive, which reduces spending and eases price pressure.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 6) {
    return {
      question: `How does a free market differ from a planned economy?`,
      answer: `A free market relies on supply and demand while a planned economy uses government direction.`,
      solution: `In a free market, prices and output are determined privately; in a planned economy, authorities decide production and distribution.`,
      difficulty: "medium",
    };
  }

  return {
    question: `Explain the concept of scarcity in economics.`,
    answer: `Scarcity means limited resources relative to unlimited wants.`,
    solution: `Economics studies how individuals and societies allocate scarce resources to satisfy needs and wants.`,
    difficulty: "easy",
  };
};

const generateComputerScienceFallback = (index: number): GeneratedQuestion => {
  const templateIndex = index % 8;
  const structures = ["array", "linked list", "stack", "queue", "binary tree"];
  const algorithms = ["search", "sort", "recursion", "iteration", "graph traversal"];

  if (templateIndex === 0) {
    return {
      question: `Explain one advantage of using a ${structures[index % structures.length]} in programming.`,
      answer: `It allows efficient access and organization of data for specific tasks.`,
      solution: `${structures[index % structures.length]} provides a structure suited to its use case, such as fast indexing or ordered insertion.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 1) {
    return {
      question: `What is the time complexity of a simple ${algorithms[index % algorithms.length]} algorithm?`,
      answer: `Typically O(n) or O(n log n) depending on implementation.`,
      solution: `${algorithms[index % algorithms.length]} algorithms vary, but many basic forms process each element or sort data with this time complexity.`,
      difficulty: "hard",
    };
  }

  if (templateIndex === 2) {
    return {
      question: `Describe the difference between hardware and software.`,
      answer: `Hardware is physical equipment; software is the programs that run on it.`,
      solution: `Hardware includes devices and circuits, while software consists of code and instructions controlling the hardware.`,
      difficulty: "easy",
    };
  }

  if (templateIndex === 3) {
    return {
      question: `What does debugging mean in computer science?`,
      answer: `Finding and fixing errors in code.`,
      solution: `Debugging involves locating faults, understanding their cause, and correcting the program so it runs correctly.`,
      difficulty: "easy",
    };
  }

  if (templateIndex === 4) {
    return {
      question: `Explain the purpose of an algorithm with one example.`,
      answer: `An algorithm is a step-by-step procedure for solving a problem, such as sorting numbers.`,
      solution: `Algorithms define clear steps to complete tasks. Sorting is a common example where the method arranges data in order.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 5) {
    return {
      question: `What is the role of a compiler in programming?`,
      answer: `It translates source code into machine code.`,
      solution: `A compiler converts human-readable code into a binary form the computer can execute.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 6) {
    return {
      question: `Why is data security important in computer applications?`,
      answer: `It protects sensitive information from unauthorized access.`,
      solution: `Security prevents data breaches, ensures privacy, and maintains user trust in applications.`,
      difficulty: "medium",
    };
  }

  return {
    question: `Define programming language and give one example.`,
    answer: `A programming language is a set of rules for writing software, such as Python.`,
    solution: `Languages like Python let developers write instructions that computers interpret and execute.`,
    difficulty: "easy",
  };
};

const generateCommerceFallback = (index: number): GeneratedQuestion => {
  const templateIndex = index % 8;
  const topics = ["profit", "loss", "accounts", "trade", "marketing"];
  const amounts = [1000, 2000, 2500, 3000, 4000];

  if (templateIndex === 0) {
    return {
      question: `If a product is sold for ${amounts[index % amounts.length]} after a 20% discount, what was the marked price?`,
      answer: `Rs. ${(amounts[index % amounts.length] / 0.8).toFixed(0)}`,
      solution: `Selling price = marked price × 0.8, so marked price = ${amounts[index % amounts.length]} ÷ 0.8 = Rs. ${(amounts[index % amounts.length] / 0.8).toFixed(0)}.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 1) {
    return {
      question: `Explain one function of accounting in business.`,
      answer: `It records financial transactions and helps decision-making.`,
      solution: `Accounting provides accurate records of money flow, which supports planning, control, and reporting.`,
      difficulty: "easy",
    };
  }

  if (templateIndex === 2) {
    return {
      question: `What is a balance sheet?`,
      answer: `It is a financial statement showing assets, liabilities, and owner’s equity.`,
      solution: `A balance sheet summarizes what a business owns and owes at a specific time, showing financial position.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 3) {
    return {
      question: `Describe one advantage of online marketing for modern businesses.`,
      answer: `It reaches more customers quickly and cost-effectively.`,
      solution: `Online marketing uses digital channels to connect with buyers across regions, often at lower cost than traditional methods.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 4) {
    return {
      question: `What is the purpose of keeping a cash book?`,
      answer: `To record all cash receipts and payments.`,
      solution: `A cash book tracks cash flow, helping businesses manage liquidity and reconcile accounts.`,
      difficulty: "easy",
    };
  }

  if (templateIndex === 5) {
    return {
      question: `Explain the difference between fixed cost and variable cost.`,
      answer: `Fixed cost stays the same regardless of output; variable cost changes with production.`,
      solution: `Fixed costs like rent remain constant, while variable costs like materials increase as more units are produced.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 6) {
    return {
      question: `What does profit margin tell a business?`,
      answer: `It shows how much profit is earned on sales.`,
      solution: `Profit margin is profit divided by revenue, indicating efficiency in converting sales into profit.`,
      difficulty: "medium",
    };
  }

  return {
    question: `How does trade help an economy?`,
    answer: `It allows specialization and access to goods not produced locally.`,
    solution: `Trade expands markets and can increase wealth by letting countries exchange resources and products.`,
    difficulty: "easy",
  };
};

const generateEnglishFallback = (index: number): GeneratedQuestion => {
  const templateIndex = index % 8;
  const sentences = [
    "She are going to school.",
    "They has finished their homework.",
    "He run every morning.",
    "The books is on the table.",
  ];

  if (templateIndex === 0) {
    return {
      question: `Correct the sentence: ${sentences[index % sentences.length]}`,
      answer: `Correct form: ${sentences[index % sentences.length].replace("are", "is").replace("has", "have").replace("run", "runs").replace("is", "are")}`,
      solution: `Identify the subject-verb agreement error and correct it according to the tense and subject.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 1) {
    return {
      question: `Choose the correct word: She will ${index % 2 === 0 ? "accept" : "except"} the responsibility.`,
      answer: `accept`,
      solution: `Accept means to receive or agree, while except means excluding. In this sentence, accept is correct.`,
      difficulty: "easy",
    };
  }

  if (templateIndex === 2) {
    return {
      question: `Write one sentence explaining the meaning of the phrase “break the ice.”`,
      answer: `It means to start a conversation or make people feel more comfortable.`,
      solution: `This idiom refers to easing tension at the start of an interaction, like breaking a layer of ice to begin a conversation.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 3) {
    return {
      question: `What is the main idea of a short passage about teamwork?`,
      answer: `Teamwork helps people achieve goals more effectively by working together.`,
      solution: `The passage would highlight cooperation, shared effort, and better results when people collaborate.`,
      difficulty: "easy",
    };
  }

  if (templateIndex === 4) {
    return {
      question: `Identify the tense: “She had finished the work before noon.”`,
      answer: `Past perfect tense.`,
      solution: `The verb form had finished indicates an action completed before another past moment.`,
      difficulty: "easy",
    };
  }

  if (templateIndex === 5) {
    return {
      question: `Change to passive voice: “The teacher explains the lesson.”`,
      answer: `The lesson is explained by the teacher.`,
      solution: `In passive voice, the object becomes the subject and the verb is changed accordingly.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 6) {
    return {
      question: `Give a synonym for the word “happy” in one sentence.`,
      answer: `Content, joyful, or pleased can all be synonyms for happy.`,
      solution: `Choose a word with a similar meaning, such as content or joyful, and use it in a sentence.`,
      difficulty: "easy",
    };
  }

  return {
    question: `Write a short formal sentence requesting permission to leave early.`,
    answer: `Could I please leave early today due to an important appointment?`,
    solution: `Use polite language and a clear reason to make the request formal and respectful.`,
    difficulty: "medium",
  };
};

const generateGeneralAwarenessFallback = (index: number): GeneratedQuestion => {
  const templateIndex = index % 8;
  const issues = ["climate change", "digital privacy", "global health", "renewable energy", "economic inequality"];
  const countries = ["India", "USA", "China", "Brazil", "Germany"];

  if (templateIndex === 0) {
    return {
      question: `Why is ${issues[index % issues.length]} an important global issue today?`,
      answer: `It affects people, economies, and the environment worldwide.`,
      solution: `${issues[index % issues.length]} has broad consequences, making it a priority for global discussion and action.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 1) {
    return {
      question: `Name one recent development in ${countries[index % countries.length]} that impacted the world.`,
      answer: `A policy change or technological advance that had international attention.`,
      solution: `Recent developments can shape trade, health, or technology and often influence global discourse.`,
      difficulty: "easy",
    };
  }

  if (templateIndex === 2) {
    return {
      question: `Explain one reason why voting is important in a democracy.`,
      answer: `It allows citizens to choose leaders and influence policy.`,
      solution: `Voting is a key way for people to participate in government and hold elected officials accountable.`,
      difficulty: "easy",
    };
  }

  if (templateIndex === 3) {
    return {
      question: `What is one benefit of digital literacy in modern society?`,
      answer: `It helps people use technology safely and effectively.`,
      solution: `Digital literacy improves communication, access to information, and awareness of online risks.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 4) {
    return {
      question: `Give one example of a sustainable practice for everyday life.`,
      answer: `Reducing plastic use or conserving water.`,
      solution: `Small changes like using reusable bags or saving water contribute to environmental sustainability.`,
      difficulty: "easy",
    };
  }

  if (templateIndex === 5) {
    return {
      question: `Describe one effect of social media on public opinion.`,
      answer: `It can spread information rapidly and shape people’s views.`,
      solution: `Social media amplifies messages quickly, influencing how people think about events and issues.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 6) {
    return {
      question: `What is one challenge faced by cities today?`,
      answer: `Traffic congestion, pollution, or housing shortages.`,
      solution: `Urban growth creates problems like congestion and resource strain that cities must manage.`,
      difficulty: "medium",
    };
  }

  return {
    question: `Why is education important for national development?`,
    answer: `It builds skills and helps citizens contribute to the economy.`,
    solution: `Education improves knowledge, productivity, and social well-being, enabling development and innovation.`,
    difficulty: "medium",
  };
};

const generateAptitudeFallback = (index: number): GeneratedQuestion => {
  const templateIndex = index % 8;
  const base = 10 + ((index % 5) * 5);
  const rate = 5 + (index % 6);
  const ratioA = 2 + (index % 5);
  const ratioB = 3 + ((index + 1) % 5);

  if (templateIndex === 0) {
    return {
      question: `If a number increases by 20% and becomes ${base + 4}, what was the original number?`,
      answer: `${((base + 4) / 1.2).toFixed(2)}`,
      solution: `Original = final ÷ 1.2 = ${(base + 4)} ÷ 1.2 = ${((base + 4) / 1.2).toFixed(2)}.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 1) {
    return {
      question: `A and B are in the ratio ${ratioA}:${ratioB}. If their total is ${base}, what is A’s share?`,
      answer: `${((base * ratioA) / (ratioA + ratioB)).toFixed(0)}`,
      solution: `A’s share = total × ratioA / (ratioA + ratioB) = ${base} × ${ratioA} / ${ratioA + ratioB} = ${((base * ratioA) / (ratioA + ratioB)).toFixed(0)}.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 2) {
    return {
      question: `Calculate the average speed of a vehicle that travels ${base} km in ${rate} hours.`,
      answer: `${(base / rate).toFixed(2)} km/h`,
      solution: `Average speed = distance / time = ${base} / ${rate} = ${(base / rate).toFixed(2)} km/h.`,
      difficulty: "easy",
    };
  }

  if (templateIndex === 3) {
    return {
      question: `What is 15% of ${base}?`,
      answer: `${(base * 0.15).toFixed(2)}`,
      solution: `15% of ${base} = ${base} × 0.15 = ${(base * 0.15).toFixed(2)}.`,
      difficulty: "easy",
    };
  }

  if (templateIndex === 4) {
    return {
      question: `If a train takes ${rate} hours to cover ${base} km, how far will it go in 1 hour?`,
      answer: `${(base / rate).toFixed(2)} km`,
      solution: `Speed = distance ÷ time = ${base} ÷ ${rate} = ${(base / rate).toFixed(2)} km per hour.`,
      difficulty: "easy",
    };
  }

  if (templateIndex === 5) {
    return {
      question: `A product costs ${base} and sells for ${base + 20}. What is the profit?`,
      answer: `${20}`,
      solution: `Profit = selling price - cost price = ${base + 20} - ${base} = 20.`,
      difficulty: "easy",
    };
  }

  if (templateIndex === 6) {
    return {
      question: `If one-third of a group is ${base}, how many people are in the whole group?`,
      answer: `${base * 3}`,
      solution: `Whole group = ${base} × 3 = ${base * 3}.`,
      difficulty: "easy",
    };
  }

  return {
    question: `Solve the series: ${base}, ${base + 2}, ${base + 4}, ... What is the next term?`,
    answer: `${base + 6}`,
    solution: `The series increases by 2 each time: ${base}, ${base + 2}, ${base + 4}, so next is ${base + 6}.`,
    difficulty: "easy",
  };
};

const generatePsychologyFallback = (index: number): GeneratedQuestion => {
  const templateIndex = index % 6;
  const topics = ["memory", "motivation", "emotion", "learning", "behavior"];

  if (templateIndex === 0) {
    return {
      question: `Define ${topics[index % topics.length]} in the context of psychology.`,
      answer: `${topics[index % topics.length]} refers to how the mind processes related experiences.`,
      solution: `${topics[index % topics.length]} is a psychological concept that describes the mental function of ${topics[index % topics.length]}.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 1) {
    return {
      question: `Explain one way people learn new skills.`,
      answer: `They learn by practice, imitation, or feedback.`,
      solution: `Learning occurs through repeated practice, observing others, and adjusting behavior based on results.`,
      difficulty: "easy",
    };
  }

  if (templateIndex === 2) {
    return {
      question: `Why is emotional intelligence important?`,
      answer: `It helps people manage feelings and relationships.`,
      solution: `Emotional intelligence allows individuals to understand emotions and respond appropriately in social contexts.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 3) {
    return {
      question: `What is behaviorism?`,
      answer: `A psychological approach that studies observable actions.`,
      solution: `Behaviorism focuses on how behavior is learned and shaped by the environment, rather than internal thoughts.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 4) {
    return {
      question: `Give one example of a psychological experiment.`,
      answer: `An experiment testing memory recall under different conditions.`,
      solution: `Researchers might compare how well people remember words when distracted versus undistracted to study memory.`,
      difficulty: "medium",
    };
  }

  return {
    question: `What is the difference between sensation and perception?`,
    answer: `Sensation is receiving stimuli, perception is interpreting them.`,
    solution: `Sensation gathers raw data through senses; perception organizes that data into meaningful experience.`,
    difficulty: "medium",
  };
};

const generateSociologyFallback = (index: number): GeneratedQuestion => {
  const templateIndex = index % 6;
  const topics = ["culture", "social norms", "family", "social change", "community"];

  if (templateIndex === 0) {
    return {
      question: `Define ${topics[index % topics.length]} in sociology.`,
      answer: `${topics[index % topics.length]} is a set of shared practices or structures in society.`,
      solution: `${topics[index % topics.length]} explains how groups of people behave and relate in society.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 1) {
    return {
      question: `Explain why social norms are important for communities.`,
      answer: `They guide behavior and help maintain social order.`,
      solution: `Norms provide expectations for conduct, making interaction predictable and stable in society.`,
      difficulty: "easy",
    };
  }

  if (templateIndex === 2) {
      return {
        question: `What is social change and one example of it?`,
        answer: `Social change is a shift in society, such as changing gender roles or technology use.`,
        solution: `It occurs when attitudes, institutions, or behaviors evolve over time, for example the spread of social media influencing communication.`,
        difficulty: "medium",
      };
  }

  if (templateIndex === 3) {
    return {
      question: `Describe one function of the family in society.`,
      answer: `It provides care, socialization, and emotional support.`,
      solution: `Families teach values, look after members, and help children learn how to live in their culture.`,
      difficulty: "easy",
    };
  }

  if (templateIndex === 4) {
    return {
      question: `What does the term “community” mean in sociology?`,
      answer: `A group of people connected by common interests, location, or identity.`,
      solution: `Communities share social ties, support members, and often cooperate around shared goals.`,
      difficulty: "medium",
    };
  }

  return {
    question: `How do social institutions influence individual behavior?`,
    answer: `They set rules and expectations that shape actions.`,
    solution: `Institutions such as schools, families, and governments provide norms that individuals follow, guiding behavior in society.`,
    difficulty: "medium",
  };
};

const generatePoliticsFallback = (index: number): GeneratedQuestion => {
  const templateIndex = index % 6;
  const topics = ["democracy", "rights", "constitution", "government", "elections"];

  if (templateIndex === 0) {
    return {
      question: `Define ${topics[index % topics.length]} and explain its role in a democratic state.`,
      answer: `${topics[index % topics.length]} means ... and helps citizens participate in governance.`,
      solution: `${topics[index % topics.length]} supports political systems by providing structure, rights, or participation mechanisms.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 1) {
    return {
      question: `What is the importance of free and fair elections?`,
      answer: `They ensure legitimacy and accountability of leaders.`,
      solution: `Elections let citizens choose representatives and hold governments responsible, which is essential for democracy.`,
      difficulty: "easy",
    };
  }

  if (templateIndex === 2) {
    return {
      question: `Explain one function of the constitution.`,
      answer: `It defines government powers and protects citizens’ rights.`,
      solution: `A constitution sets the rules for how a country is governed and limits authority to prevent abuse.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 3) {
    return {
      question: `Why are citizen rights important in a republic?`,
      answer: `They protect individuals and ensure fair treatment by the state.`,
      solution: `Rights guarantee freedoms and help maintain justice, allowing people to live with dignity.`,
      difficulty: "medium",
    };
  }

  if (templateIndex === 4) {
    return {
      question: `What does separation of powers mean?`,
      answer: `Dividing government authority into separate branches.`,
      solution: `It prevents concentration of power by assigning law-making, law-enforcing, and law-adjudicating roles to different institutions.`,
      difficulty: "medium",
    };
  }

  return {
    question: `Describe one way citizens can participate in public life.`,
    answer: `By voting, joining civic groups, or contacting representatives.`,
    solution: `Participation includes voting in elections, engaging in public debates, and holding leaders accountable.`,
    difficulty: "easy",
  };
};

const generateGeneralFallback = (index: number, request: QuestionRequest): GeneratedQuestion => {
  const subject = request.subject || "general knowledge";
  const topic = request.topic || subject;
  const ordinal = index + 1;
  const details = [
    "one exam-style example",
    "a clear definition",
    "a practical application",
    "a common mistake",
    "one key point",
    "one important step",
    "a real-world use",
    "a short comparison",
    "a typical formula",
    "a simple summary",
  ];
  const stems = [
    `Explain ${topic} in ${subject}, including ${details[index % details.length]}.`,
    `Describe the main idea of ${topic} in ${subject} and give ${details[index % details.length]}.`,
    `Write a short exam-style response on ${topic} in ${subject} with ${details[index % details.length]}.`,
    `Summarize ${topic} in ${subject} and mention ${details[index % details.length]}.`,
    `What is ${topic} in ${subject}? Explain it with ${details[index % details.length]}.`,
  ];
  const question = `${stems[index % stems.length]} Explain with example ${ordinal}.`;

  return {
    question,
    answer: `A clear answer describing ${topic}, its purpose, and ${details[index % details.length]}.`,
    solution: `Start with the definition of ${topic}, follow with ${details[index % details.length]}, and conclude with a short example or application that students can relate to.`,
    difficulty: "medium",
  };
};

const localQuestionTemplates = (request: QuestionRequest): GeneratedQuestion[] => {
  const subject = normalizeSubject(request.subject);
  const topic = request.topic || (subject === "general" ? request.subject : subject);
  const year = request.year;
  const exam = request.exam;

  const subjectGenerator: Record<string, (index: number, request: QuestionRequest) => GeneratedQuestion> = {
    physics: (index) => generatePhysicsFallback(index),
    mathematics: (index) => generateMathFallback(index),
    chemistry: (index) => generateChemistryFallback(index),
    biology: (index) => generateBiologyFallback(index, request.subject),
    reasoning: (index) => generateReasoningFallback(index),
    history: (index) => generateHistoryFallback(index),
    geography: (index) => generateGeographyFallback(index),
    economics: (index) => generateEconomicsFallback(index),
    "computer science": (index) => generateComputerScienceFallback(index),
    commerce: (index) => generateCommerceFallback(index),
    psychology: (index) => generatePsychologyFallback(index),
    sociology: (index) => generateSociologyFallback(index),
    "political science": (index) => generatePoliticsFallback(index),
    english: (index) => generateEnglishFallback(index),
    "general-awareness": (index) => generateGeneralAwarenessFallback(index),
    aptitude: (index) => generateAptitudeFallback(index),
    general: (idx, req) => generateGeneralFallback(idx, req),
  };

  const generator = subjectGenerator[subject] ?? subjectGenerator.general;

  const output: GeneratedQuestion[] = [];
  const used = new Set<string>();
  let index = 0;
  const maxAttempts = Math.max(request.count * 10, 300);

  while (output.length < request.count && index < maxAttempts) {
    const candidate = generator(index, request);
    const questionText = candidate.question.trim();
    if (!used.has(questionText)) {
      used.add(questionText);
      output.push({
        ...candidate,
        year,
        exam,
        topic: request.topic,
        difficulty: candidate.difficulty ?? "medium",
        question: `${request.mode === "pyq" ? "(Past paper style) " : ""}${questionText}`,
      });
    }
    index++;
  }

  while (output.length < request.count) {
    const candidate = generateGeneralFallback(index, request);
    const questionText = candidate.question.trim();
    if (!used.has(questionText)) {
      used.add(questionText);
      output.push({
        ...candidate,
        year,
        exam,
        topic: request.topic,
        difficulty: candidate.difficulty ?? "medium",
        question: `${request.mode === "pyq" ? "(Past paper style) " : ""}${questionText}`,
      });
    }
    index++;
  }

  return output.slice(0, request.count);
};

const tidyPrompt = (text: string) => text.trim().replace(/\s+/g, " ");

const extractTopic = (text: string) =>
  tidyPrompt(text)
    .replace(/^(what is|what are|who is|who are|explain|define|describe|tell me about|how to|how do i|write about)\s+/i, "")
    .replace(/[?.!]+$/g, "")
    .trim();

const localGeneralReply = (latestQuestion: string) => {
  const prompt = tidyPrompt(latestQuestion);
  const lower = prompt.toLowerCase();
  const topic = extractTopic(prompt) || "this topic";

  if (/^(hi|hello|hey|hii|namaste)\b/i.test(prompt)) {
    return [
      "Hi! Ask me anything: a concept, a coding problem, a timetable, a PYQ topic, or a writing task.",
      "",
      "For example: `explain photosynthesis`, `write a Python factorial program`, or `make a 7-day study plan for physics`.",
    ].join("\n");
  }

  if (/(javascript|typescript|html|css|java|c\+\+|cpp|c program|react).*(code|script|program)|(?:code|script|program).*(javascript|typescript|html|css|java|c\+\+|cpp|react)/i.test(prompt)) {
    if (/javascript|js/i.test(prompt)) {
      return [
        "Here is a simple JavaScript example:",
        "",
        "```javascript",
        "const numbers = [1, 2, 3, 4, 5];",
        "const sum = numbers.reduce((total, value) => total + value, 0);",
        "",
        "console.log(`Sum: ${sum}`);",
        "```",
        "",
        "You can tell me the exact task and I will shape the code for it.",
      ].join("\n");
    }

    if (/html|css/i.test(prompt)) {
      return [
        "Here is a small HTML/CSS starter:",
        "",
        "```html",
        "<!doctype html>",
        "<html>",
        "<head>",
        "  <style>",
        "    body { font-family: Arial, sans-serif; padding: 24px; }",
        "    .box { border: 1px solid #ddd; padding: 16px; border-radius: 8px; }",
        "  </style>",
        "</head>",
        "<body>",
        "  <div class=\"box\">Hello, world!</div>",
        "</body>",
        "</html>",
        "```",
      ].join("\n");
    }

    return [
      "I can write that code. Here is a basic structure:",
      "",
      "```text",
      "1. Read the input",
      "2. Process the data",
      "3. Print or return the result",
      "```",
      "",
      "Send the language and exact task, and I will give the complete program.",
    ].join("\n");
  }

  if (/^(what is|what are|define)\b/i.test(prompt)) {
    return [
      `**${topic}** means the main idea, object, or process being asked about.`,
      "",
      "**Simple explanation:**",
      `${topic} can be understood by looking at its definition, purpose, and one example.`,
      "",
      "**Answer format you can use:**",
      `- Definition: ${topic} is the concept being discussed.`,
      "- Key point: mention its main function or importance.",
      "- Example: add one real or textbook example.",
      "",
      `If you want, ask: \`explain ${topic} with example\`, and I will expand it.`,
    ].join("\n");
  }

  if (/^(explain|describe|tell me about)\b/i.test(prompt)) {
    return [
      `**${topic}**`,
      "",
      "Here is a clear explanation:",
      "",
      `- **Meaning:** ${topic} is the central concept in this question.`,
      "- **Main idea:** understand what it does, why it matters, and where it is used.",
      "- **Example:** connect it to a simple real-life or exam-style situation.",
      "- **Exam tip:** write the definition first, then add 2-3 key points and an example.",
      "",
      "A good short answer structure is: definition -> key points -> example -> conclusion.",
    ].join("\n");
  }

  if (/^(how to|how do i|how can i)\b/i.test(prompt)) {
    return [
      `Here is a practical way to handle **${topic}**:`,
      "",
      "1. Identify the exact goal.",
      "2. Break it into small steps.",
      "3. Do the first simple version.",
      "4. Check the result and fix mistakes.",
      "5. Improve it with examples or practice.",
      "",
      "If this is for coding, send the language. If it is for study, send the subject and exam.",
    ].join("\n");
  }

  if (/write|essay|paragraph|letter|application|email|summary|notes/i.test(lower)) {
    return [
      `Here is a clean draft for **${topic}**:`,
      "",
      `${topic} is an important subject because it helps us understand the main idea clearly. To write a good answer, start with a short introduction, explain two or three key points, and end with a simple conclusion.`,
      "",
      "**Structure:**",
      "- Introduction: introduce the topic.",
      "- Body: explain the main points with examples.",
      "- Conclusion: summarize the idea in one or two lines.",
    ].join("\n");
  }

  if (/plan|timetable|schedule|study routine|revision/i.test(lower)) {
    return [
      "Here is a simple study plan:",
      "",
      "| Time | Activity |",
      "| --- | --- |",
      "| 25 min | Study one concept |",
      "| 5 min | Short break |",
      "| 25 min | Solve questions |",
      "| 10 min | Review mistakes |",
      "",
      "**Tip:** Use this cycle 2-4 times per day and revise weak topics first.",
    ].join("\n");
  }

  if (/solve|calculate|find|equation|sum|average|percentage/i.test(lower)) {
    return [
      "I can solve it step by step.",
      "",
      "For a math or numericals question, send the full expression or values. Example:",
      "",
      "```text",
      "Solve: x^2 - 5x + 6 = 0",
      "```",
      "",
      "Then I will show the formula, substitution, steps, and final answer.",
    ].join("\n");
  }

  return [
    `**Answer: ${prompt}**`,
    "",
    "Here is a useful way to understand it:",
    "",
    `- First, identify the main topic: **${topic}**.`,
    "- Then write the core meaning in one simple sentence.",
    "- Add 2-3 important points.",
    "- Finish with an example or use case.",
    "",
    "If you ask with a little more detail, I can give a more exact answer with examples, code, or step-by-step solution.",
  ].join("\n");
};


const demoAssistantReply = (messages: ChatMessage[]) => {
  const userMessages = messages.filter((m) => m.role === "user").map((m) => m.content.trim());
  const latestQuestion = userMessages[userMessages.length - 1] ?? "your request";
  const q = latestQuestion.toLowerCase();

  if (/(python|phython|pyhton).*(script|program|code)|(?:script|program|code).*(python|phython|pyhton)/i.test(latestQuestion)) {
    if (/headline|scrape|scraping|news/i.test(latestQuestion)) {
      return [
        "Here is a simple Python script to scrape headlines from a webpage:",
        "",
        "```python",
        "import requests",
        "from bs4 import BeautifulSoup",
        "",
        "url = \"https://example.com\"  # replace with the news page URL",
        "",
        "headers = {",
        "    \"User-Agent\": \"Mozilla/5.0\"",
        "}",
        "",
        "response = requests.get(url, headers=headers, timeout=10)",
        "response.raise_for_status()",
        "",
        "soup = BeautifulSoup(response.text, \"html.parser\")",
        "",
        "headlines = []",
        "for tag in soup.find_all([\"h1\", \"h2\", \"h3\"]):",
        "    text = tag.get_text(strip=True)",
        "    if text:",
        "        headlines.append(text)",
        "",
        "for index, headline in enumerate(headlines[:20], start=1):",
        "    print(f\"{index}. {headline}\")",
        "```",
        "",
        "Install the needed packages:",
        "",
        "```bash",
        "pip install requests beautifulsoup4",
        "```",
      ].join("\n");
    }

    if (/natural|first.*natural|natural.*no|natural.*number/i.test(latestQuestion)) {
      return [
        "Here is a Python script to print the first `n` natural numbers:",
        "",
        "```python",
        "n = int(input(\"Enter how many natural numbers to print: \"))",
        "",
        "for number in range(1, n + 1):",
        "    print(number)",
        "```",
        "",
        "Example:",
        "",
        "```text",
        "Enter how many natural numbers to print: 5",
        "1",
        "2",
        "3",
        "4",
        "5",
        "```",
      ].join("\n");
    }

    return [
      "Here is a basic Python script:",
      "",
      "```python",
      "name = input(\"Enter your name: \")",
      "print(f\"Hello, {name}!\")",
      "```",
      "",
      "Tell me what the script should do, and I can make it more specific.",
    ].join("\n");
  }

  if (/first.*natural|natural.*no|natural.*number/i.test(q)) {
    return [
      "The first natural number is **1**.",
      "",
      "Natural numbers are counting numbers:",
      "",
      "```text",
      "1, 2, 3, 4, 5, ...",
      "```",
      "",
      "Python example:",
      "",
      "```python",
      "print(1)",
      "```",
    ].join("\n");
  }

  if (/question|pyq|sample|previous year|exam|practice/i.test(latestQuestion)) {
    return [
      "- Focus on the topic by breaking it into the exact concepts the exam usually tests.",
      "- Practice 3-5 representative questions in the exam style.",
      "- Review each worked solution step by step and write down the mistake pattern.",
      "- Revise the same topic again after one day and one week.",
    ].join("\n");
  }

  return localGeneralReply(latestQuestion);
};

async function callAI(messages: ChatMessage[], options?: { model?: string }) {
  const apiKey = process.env.LOVABLE_API_KEY ?? process.env.OPENAI_API_KEY ?? process.env.AI_API_KEY;
  if (!apiKey) {
    return demoAssistantReply(messages);
  }
  const selectedModel = normalizeChatModel(options?.model);
  const provider = process.env.LOVABLE_API_KEY
    ? "lovable"
    : process.env.OPENAI_API_KEY
    ? "openai"
    : "generic";
  const url =
    provider === "openai"
      ? OPENAI_URL
      : provider === "lovable"
      ? LOVABLE_GATEWAY_URL
      : process.env.AI_API_URL ?? OPENAI_URL;
  const model =
    selectedModel ??
    (provider === "openai"
      ? "gpt-5"
      : provider === "lovable"
      ? process.env.LOVABLE_MODEL ?? "gemini-3-flash-preview"
      : process.env.AI_MODEL ?? "gemini-3-flash-preview");

  const body = JSON.stringify({
    model,
    temperature: 0.0,
    max_tokens: 3000,
    messages,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body,
  });

  if (!res.ok) {
    if (res.status === 429) throw new Error("Rate limit reached. Please wait a moment and try again.");
    if (res.status === 402) throw new Error("AI credits exhausted. Please top up your workspace.");
    const t = await res.text();
    console.error("AI gateway error", res.status, t);
    throw new Error("AI service unavailable");
  }

  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? "";
}

/** Chat with study assistant */
export const askAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { messages: ChatMessage[] }) =>
    z
      .object({
        messages: z
          .array(
            z.object({
              role: z.enum(["system", "user", "assistant"]),
              content: z.string().min(1).max(4000),
            }),
          )
          .min(1)
          .max(30),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const reply = await callAI([
      {
        role: "system",
        content:
          "You are StudySync AI — a fast, knowledgeable general assistant in the style of ChatGPT / Gemini. Answer ANY question across any subject (math, science, programming, history, languages, current affairs, career, life skills, etc.) with accurate, clear, well-structured markdown. Use headings, lists, code blocks, and examples when useful. Be concise by default but go deep when the question warrants it. Always use the full prior conversation as context, and when the user references earlier questions, recall and refer back to them.",
      },
      ...data.messages,
    ]);
    return { reply };
  });

/** Ask 2-3 clarifying questions before generating a timetable */
export const getTimetableQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { subjects: string[]; hoursPerDay: number; goal?: string }) =>
    z
      .object({
        subjects: z.array(z.string().min(1).max(60)).min(1).max(12),
        hoursPerDay: z.number().min(1).max(16),
        goal: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const reply = await callAI([
      {
        role: "system",
        content:
          'You are a study planner. Given the student\'s subjects, hours/day, and goal, ask 2-3 short clarifying questions that will make the timetable more personal (e.g. exam dates, weakest topics, preferred study time, breaks). Respond ONLY with a JSON array of strings, no prose. Example: ["When is your exam?", "Which subject feels hardest?"].',
      },
      {
        role: "user",
        content: `Subjects: ${data.subjects.join(", ")}\nHours/day: ${data.hoursPerDay}\nGoal: ${data.goal ?? "(not provided)"}`,
      },
    ]);
    let questions: string[] = [];
    try {
      const match = reply.match(/\[[\s\S]*\]/);
      questions = match ? JSON.parse(match[0]) : [];
    } catch {
      questions = [];
    }
    return { questions: questions.slice(0, 3) };
  });

/** Generate a personalized study timetable */
export const generateTimetable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { subjects: string[]; hoursPerDay: number; goal?: string; answers?: { q: string; a: string }[] }) =>
    z
      .object({
        subjects: z.array(z.string().min(1).max(60)).min(1).max(12),
        hoursPerDay: z.number().min(1).max(16),
        goal: z.string().max(500).optional(),
        answers: z.array(z.object({ q: z.string().max(300), a: z.string().max(500) })).max(5).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const answersBlock = data.answers && data.answers.length
      ? `\n\nAdditional context from the student:\n${data.answers.map((x) => `- ${x.q} → ${x.a}`).join("\n")}`
      : "";
    const prompt = `Create a 7-day personalized study timetable.
Subjects: ${data.subjects.join(", ")}
Available study hours per day: ${data.hoursPerDay}
${data.goal ? `Goal: ${data.goal}` : ""}${answersBlock}

Output a clean markdown table with columns: Day | Time Block | Subject | Activity. Include 25/5 pomodoro hints and one motivational tip at the end.`;
    const reply = await callAI([
      { role: "system", content: "You are an expert academic planner. Always reply in clean markdown." },
      { role: "user", content: prompt },
    ]);
    return { plan: reply };
  });

/** Get AI insights about weak subjects */
export const getInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { stats: { subject: string; minutes: number; completedTasks: number; pendingTasks: number }[] }) =>
    z
      .object({
        stats: z
          .array(
            z.object({
              subject: z.string().max(60),
              minutes: z.number().min(0),
              completedTasks: z.number().min(0),
              pendingTasks: z.number().min(0),
            }),
          )
          .max(20),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (data.stats.length === 0) {
      return { insights: "Start tracking study sessions and tasks to get personalized insights!" };
    }
    const prompt = `Analyze this student's study data and give 3-4 short bullet insights:
- Which subjects need more attention
- One motivational tip
- One productivity suggestion

Data:
${data.stats.map((s) => `- ${s.subject}: ${s.minutes} min studied, ${s.completedTasks} tasks done, ${s.pendingTasks} pending`).join("\n")}

Reply in markdown, under 150 words.`;
    const reply = await callAI([
      { role: "system", content: "You are a supportive academic coach." },
      { role: "user", content: prompt },
    ]);
    return { insights: reply };
  });

/** Generate previous-year or sample questions as structured JSON */
export const generateQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      mode: "pyq" | "sample";
      exam: string;
      classLevel?: string;
      subject: string;
      topic?: string;
      year?: string;
      syllabus?: string;
      count?: number;
      model?: string;
    }) =>
      z
        .object({
          mode: z.enum(["pyq", "sample"]),
          exam: z.string().min(1).max(100),
          classLevel: z.string().max(60).optional(),
          subject: z.string().min(1).max(100),
          topic: z.string().max(200).optional(),
          year: z.string().max(40).optional(),
          syllabus: z.string().max(200).optional(),
          count: z.number().int().min(1).max(100).optional(),
          model: z.enum(CHAT_MODELS).optional(),
        })
        .parse(input),
  )
  .handler(async ({ data }) => {
    const count = data.count ?? 5;
    const modeLabel =
      data.mode === "pyq"
        ? `actual previous-year paper questions${data.year ? ` from ${data.year}` : ""}`
        : `high-quality sample / practice questions in the style of the exam`;

    const sys = `You are a ChatGPT/Gemini-style exam question generator. Use your expert exam-writing and problem-solving capability to produce accurate questions, answers, and worked solutions in a helpful, professional, and student-friendly tone.
Schema:
{"questions":[{"question":"...","options":["A) ...","B) ...","C) ...","D) ..."]?,"answer":"...","solution":"step by step reasoning...","difficulty":"easy|medium|hard","year":"2023"?,"exam":"...","topic":"..."}]}
Rules:
- For PYQ mode, generate questions in the exact style of a previous-year exam paper, not generic practice questions.
- If a year is provided, emulate that year's paper format, question style, section structure, and difficulty as closely as possible.
- If the exact paper is not available, produce representative questions that still match the exam's real past-paper format and phrasing.
- Make each question unique within the set and avoid repeating the same question text when the user requests new questions multiple times.
- Follow the subject style closely. Adapt to the requested subject and exam level: school, board, university, engineering, medical, UPSC, banking, or professional certification.
- For English, use grammar, vocabulary, passage analysis, writing, and literature-style questions.
- For Physics, use conceptual reasoning, derivations, numerical problems, and physics language.
- For Chemistry, use reactions, formulas, calculations, and application-based problems.
- For Mathematics, use algebra, geometry, calculus, arithmetic, and proof-style questions.
- For History, use dates, events, source-based reasoning, and short/long answer prompts.
- For Geography, use map skills, physical processes, data interpretation, and case-based questions.
- For Commerce, economics, business, or finance, use accounting, case problems, current affairs, and calculation-based questions.
- For UPSC, banking, or reasoning exams, include analytical reasoning, data interpretation, current affairs, and aptitude-style items.
- Label each question with a clear difficulty like "easy", "medium", or "hard".
- The answer field should be direct, accurate, and conceptually deep; do not give an incomplete one-line answer when a fuller explanation is appropriate.
- The solution MUST be step-by-step reasoning that expands the answer, explains the method, and ends with the final answer.
- Use clean plain text (write x^2, sqrt(x), etc.). No LaTeX, no markdown.
- Include "options" only if MCQ; otherwise omit.
- If you cannot produce valid JSON, output exactly {"questions": []}.
- Output ONLY the JSON object.`;

    const usr = `Generate ${count} ${modeLabel}.
Exam: ${data.exam}
${data.classLevel ? `Class / Level: ${data.classLevel}` : ""}
Subject: ${data.subject}
${data.topic ? `Topic: ${data.topic}` : ""}
${data.syllabus ? `Syllabus / scope: ${data.syllabus}` : ""}
Style guidance: Produce questions appropriate for the exam and subject requested. For school or board exams, use board-style formats and wording. For university, postgraduate, UPSC, banking, aptitude, or professional exams, match the relevant exam structure, marks, and difficulty.
Ensure questions are unique, student-friendly, and suitable for competitive or academic preparation.
Include a difficulty label for each item, and make each answer direct yet conceptually deep.
Provide solutions that are clear, step-by-step, professional, and sufficiently detailed for students.
Cover varied difficulty. Each item MUST include a worked solution.`;

    const apiKey = process.env.LOVABLE_API_KEY ?? process.env.OPENAI_API_KEY ?? process.env.AI_API_KEY;
    if (!apiKey) {
      const questions = localQuestionTemplates({
        mode: data.mode,
        exam: data.exam,
        subject: data.subject,
        topic: data.topic,
        year: data.year,
        count,
      });
      return { questions: questions.slice(0, count), meta: { mode: data.mode, exam: data.exam, year: data.year, subject: data.subject, classLevel: data.classLevel, topic: data.topic } };
    }

    const reply = await callAI([
      { role: "system", content: sys },
      { role: "user", content: usr },
    ], { model: data.model });
    let parsed: { questions?: GeneratedQuestion[] } = {};

    const cleanJson = (text: string) => {
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start === -1 || end === -1) return "";
      return text.slice(start, end + 1).replace(/,\s*([\]}])/g, "$1");
    };

    try {
      parsed = JSON.parse(reply);
    } catch {
      const jsonText = cleanJson(reply);
      try {
        parsed = jsonText ? JSON.parse(jsonText) : {};
      } catch {
        parsed = {};
      }
    }
    const questions = Array.isArray(parsed.questions) ? parsed.questions.slice(0, count) : [];
    return {
      questions,
      meta: {
        mode: data.mode,
        exam: data.exam,
        year: data.year,
        subject: data.subject,
        classLevel: data.classLevel,
        topic: data.topic,
      },
    };
  });

/** Save selected questions to the user's question bank */
export const saveQuestionsToBank = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      mode: "pyq" | "sample";
      exam: string;
      year?: string;
      classLevel?: string;
      subject: string;
      questions: GeneratedQuestion[];
    }) =>
      z
        .object({
          mode: z.enum(["pyq", "sample"]),
          exam: z.string().max(100),
          year: z.string().max(40).optional(),
          classLevel: z.string().max(60).optional(),
          subject: z.string().max(100),
          questions: z
            .array(
              z.object({
                question: z.string().min(1).max(4000),
                options: z.array(z.string().max(500)).max(8).optional(),
                answer: z.string().max(1000).optional(),
                solution: z.string().max(6000).optional(),
                year: z.string().max(40).optional(),
                exam: z.string().max(100).optional(),
                topic: z.string().max(200).optional(),
              }),
            )
            .min(1)
            .max(20),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const rows = data.questions.map((q) => ({
      user_id: context.userId,
      exam: q.exam || data.exam,
      year: q.year || data.year || null,
      class_level: data.classLevel || null,
      subject: data.subject,
      topic: q.topic || null,
      question: q.question,
      options: q.options ?? null,
      answer: q.answer || null,
      solution: q.solution || null,
      is_pyq: data.mode === "pyq",
    }));
    const { error, data: inserted } = await context.supabase
      .from("question_bank")
      .insert(rows)
      .select("id");
    if (error) throw new Error(error.message);
    return { saved: inserted?.length ?? 0 };
  });
