const PRESET_TRANSCRIPTS = [
  // Theme A: Friendly dragon afraid of fire
  `User: I want a story about a dragon who is scared of fire!

Agent: Oh wow, a dragon scared of fire — that's such a funny and clever idea! What does this dragon do instead of breathing fire? Maybe it breathes something silly like bubbles or glitter?

User: Bubbles! Big sparkly rainbow bubbles that float everywhere!

Agent: Rainbow bubbles — I love it! Where does this dragon live? Maybe in a cave, a cozy nest in a tree, or somewhere magical by the water?

User: He lives under a waterfall and the bubbles make rainbows in the mist

Agent: That is so beautiful! Does your bubble dragon have any friends, or does he feel a little lonely because other dragons cannot understand him?

User: He has a tiny frog friend called Squibble who rides on his nose and cheers him up

Agent: Squibble the frog riding on a dragon's nose — that is the most perfect friendship I have ever heard! I think we have everything we need for a wonderful story. Let me create it for you now!`,

  // Theme B: Kid finds a talking cat in the backyard
  `User: I want a story about a kid who finds a talking cat in the backyard!

Agent: A talking cat in the backyard — how exciting and mysterious! What does the cat say first when the kid discovers it? Maybe it asks for something, or says something really surprising?

User: The cat tips its tiny hat and says excuse me do you have any fish please

Agent: A cat with a hat who says please — this cat has very good manners! What is the kid like who finds this polite cat? Tell me about them!

User: Her name is Priya and she loves collecting interesting rocks and bugs from the garden

Agent: Priya sounds brilliant and curious — just the right person to find a talking cat! Where do Priya and the cat decide to go together once they meet?

User: They go on an adventure to find the secret hat factory where the cat came from because cats should not have hats

Agent: A secret hat factory full of cats — that is wonderfully strange and I must know what they find there! I have everything I need to write this story. Let me create it for you right now!`,

  // Theme C: Astronaut hamster on the moon
  `User: I want a story about a hamster astronaut who flies to the moon!

Agent: A hamster astronaut — the bravest and fluffiest kind! What is the hamster's name, and what is the most important reason it wants to go to the moon?

User: Captain Fluffkins wants to find out if the moon is made of cheese because he really really loves cheese

Agent: Captain Fluffkins on an official cheese investigation — this is a very serious scientific mission! When Captain Fluffkins finally lands, what does he actually find on the moon?

User: It is not cheese but there are tiny moon mice who have been waiting for a hamster visitor for a hundred years

Agent: Moon mice who have been waiting a hundred years — they must be so excited! What do the moon mice want to show Captain Fluffkins while he visits?

User: They show him their moon garden where they grow moon carrots and special moon cheese seeds that take one hundred years to grow

Agent: Moon cheese seeds that take a hundred years — so the cheese was always going to be there, Captain Fluffkins just arrived too early! What a wonderful and surprising story this is going to be. Let me write it for you now!`,
] as const;

export function getRandomPresetTranscript(): string {
  const index = Math.floor(Math.random() * PRESET_TRANSCRIPTS.length);
  return PRESET_TRANSCRIPTS[index];
}
