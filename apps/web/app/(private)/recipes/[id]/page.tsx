export default async function RecipePage({params}: {params: Promise<{id: string}>}) {
  const { id } = await params;
  return (
    <div>
      <h1>Recipe {id}</h1>
    </div>
  );
}
