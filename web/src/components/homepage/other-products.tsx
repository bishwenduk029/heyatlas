"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Code2, Mail, Calendar, FileSearch, Globe, BarChart } from "lucide-react";

interface UseCase {
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  example: string;
}

const useCases: UseCase[] = [
  {
    name: "Code & Development",
    description: "Debug code, write scripts, or research technical documentation hands-free",
    icon: Code2,
    example: '"Find the bug in my Python script and fix it"',
  },
  {
    name: "Email Management",
    description: "Draft emails, summarize threads, and organize your inbox with voice commands",
    icon: Mail,
    example: '"Summarize my unread emails from this week"',
  },
  {
    name: "Research & Analysis",
    description: "Deep research across multiple sources, compiled into clear, actionable insights",
    icon: FileSearch,
    example: '"Research the latest trends in AI agents"',
  },
  {
    name: "Calendar & Scheduling",
    description: "Schedule meetings, check availability, and manage your calendar effortlessly",
    icon: Calendar,
    example: '"Find a time for a 30-minute meeting next week"',
  },
  {
    name: "Web Automation",
    description: "Fill forms, extract data, and navigate complex websites automatically",
    icon: Globe,
    example: '"Fill out this job application with my resume"',
  },
  {
    name: "Data Processing",
    description: "Analyze spreadsheets, generate reports, and visualize data on demand",
    icon: BarChart,
    example: '"Create a sales report from last month\'s data"',
  },
];

export function OtherProducts() {
  return (
    <section className="py-24 bg-muted/30">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Endless possibilities at your command
          </h2>
          <p className="mt-4 text-lg leading-8 text-muted-foreground">
            From coding to research, Nirmanus handles your daily digital tasks so you can focus on what matters
          </p>
        </div>
        
        <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-6 sm:mt-20 md:grid-cols-2 lg:mx-0 lg:max-w-none lg:grid-cols-3">
          {useCases.map((useCase) => {
            const IconComponent = useCase.icon;
            return (
              <Card key={useCase.name} className="group relative overflow-hidden transition-all duration-300 hover:shadow-lg">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <IconComponent className="h-5 w-5" />
                    </div>
                    <h3 className="font-semibold text-foreground">
                      {useCase.name}
                    </h3>
                  </div>
                  
                  <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
                    {useCase.description}
                  </p>
                  
                  <div className="mt-4 rounded-lg bg-muted p-3 border border-border">
                    <p className="text-xs text-muted-foreground italic">
                      {useCase.example}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}