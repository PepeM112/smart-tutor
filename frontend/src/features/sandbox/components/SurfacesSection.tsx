'use client';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { DEMO_ITEMS } from '../demoData';

import { SandboxDemo, SandboxSection } from './SandboxSection';

export function SurfacesSection() {
  return (
    <SandboxSection id="surfaces" title="Card, table and tabs">
      <SandboxDemo label="Card">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Spanish irregular verbs</CardTitle>
              <CardDescription>24 questions</CardDescription>
              <CardAction>
                <Button variant="outline" size="sm">
                  Open
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>Present and preterite forms of the most common irregular verbs.</CardContent>
            <CardFooter className="justify-end gap-2 border-t border-border py-3">
              <Button variant="ghost">Cancel</Button>
              <Button>Save</Button>
            </CardFooter>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Small card</CardTitle>
              <CardDescription>The sm size has tighter padding.</CardDescription>
            </CardHeader>
            <CardContent>Body text.</CardContent>
          </Card>
        </div>
      </SandboxDemo>

      <SandboxDemo label="Table">
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Title</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Owner</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {DEMO_ITEMS.slice(0, 3).map(item => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.title}</TableCell>
                  <TableCell>{item.kind}</TableCell>
                  <TableCell>{item.owner}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SandboxDemo>

      <SandboxDemo label="Tabs">
        <Tabs defaultValue="content">
          <TabsList>
            <TabsTrigger value="content">Content</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="disabled" disabled>
              Disabled
            </TabsTrigger>
          </TabsList>
          <TabsContent value="content">Content tab.</TabsContent>
          <TabsContent value="members">Members tab.</TabsContent>
          <TabsContent value="settings">Settings tab.</TabsContent>
        </Tabs>
      </SandboxDemo>

      <SandboxDemo label="Tabs as a segmented control">
        <Tabs defaultValue="content" className="max-w-xs">
          <TabsList className="gap-0.5 rounded-lg border-0 bg-muted p-0.5">
            {['content', 'members'].map(value => (
              <TabsTrigger
                key={value}
                value={value}
                className="mb-0 flex-1 justify-center rounded-md border-0 px-2 py-1 font-normal capitalize data-[state=active]:bg-card data-[state=active]:font-medium data-[state=active]:shadow-card"
              >
                {value}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </SandboxDemo>
    </SandboxSection>
  );
}
