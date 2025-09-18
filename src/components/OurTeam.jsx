
"use client";
import React from "react";
import { AnimatedTooltip } from "./ui/animated-tooltip";
const people = [
  {
    id: 1,
    name: "Sameer Sahu",
    designation: "Full Stack Developer",
    image:
      "https://avatars.githubusercontent.com/u/62953198?v=4",
  },
];


export function OurTeamSection() {
  return (
    <div className="flex flex-col items-center justify-center mb-10 w-full">
      <div className="font-normal text-2xl text-neutral-700 dark:text-neutral-400 max-w-lg">
        Our Team
      </div>
      <div className="mt-4 flex flex-row items-center justify-center mb-10 w-full">
        <AnimatedTooltip items={people} />
      </div>
    </div>
  );
}

